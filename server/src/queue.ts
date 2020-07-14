// BufferedMessageQueue and related classes/interfaces originated in the ESLint
// extension licensed under the MIT license.
// https://github.com/microsoft/vscode-eslint/blob/d40b96d4a2f0d085770b2bdce87b985bdd198bec/server/src/eslintServer.ts#L828
import {
  IConnection,
  NotificationHandler,
  NotificationType,
} from 'vscode-languageserver';

/**
 * Defines a type of notification for which subscriptions in the queue can be raised.
 */
interface Notification<P> {
  method: string;
  params: P;
  documentVersion: number | undefined;
}

/**
 * An object that provides a document version.
 */
interface VersionProvider<P> {
  (params: P): number | undefined;
}

/**
 * Message queue for processing requests to lint a document. Ensures that a
 * given request is acting against the current version of the document to avoid
 * using up resources to run lint operations against a stale document version
 * where the results will no longer apply.
 */
export class BufferedMessageQueue {
  private queue: Notification<any>[];
  private notificationHandlers: Map<string, { handler: NotificationHandler<any>; versionProvider?: VersionProvider<any> }>;
  private timer: NodeJS.Immediate | undefined;

  /**
   * Initializes a new queue.
   * @param {IConnection} connection - The connection for communicating with clients.
   */
  constructor(private connection: IConnection) {
    this.queue = [];
    this.notificationHandlers = new Map();
  }

  /**
   * Callback used by the queue to get a document version.
   * @callback queue~versionProvider
   * @param {P} params - The subject of the notification.
   * @return {number} The document version.
   */

  /**
   * Registers a notification and handler at the same time.
   * @param {NotificationType<P, RO>} type - The type of notification to process.
   * @param {NotificationHandler<P>} handler - The handler for the notification.
   * @param {queue~versionProvider} versionProvider - A provider that gives the document version.
   */
  public registerNotification<P, RO>(type: NotificationType<P, RO>, handler: NotificationHandler<P>, versionProvider?: (params: P) => number): void {
    this.connection.onNotification(type, (params) => {
      this.queue.push({
        method: type.method,
        params: params,
        documentVersion: versionProvider ? versionProvider(params) : undefined,
      });
      this.trigger();
    });
    this.notificationHandlers.set(type.method, { handler, versionProvider });
  }

  /**
   * Adds a message to the queue and kicks off processing.
   * @param {NotificationType<P, RO>} type - The type of notification to add to the queue.
   * @param {P} params - The subject of the notification.
   * @param {number} version - The document version associated with the notification.
   */
  public addNotificationMessage<P, RO>(type: NotificationType<P, RO>, params: P, version: number): void {
    this.queue.push({
      method: type.method,
      params,
      documentVersion: version,
    });
    this.trigger();
  }

  /**
   * Registers a handler for a notification.
   * @param {NotificationType<P, RO>} type - The type of notification to process.
   * @param {NotificationHandler<P>} handler - The handler for the notification.
   * @param {queue~versionProvider} versionProvider - A provider that gives the document version.
   */
  public onNotification<P, RO>(type: NotificationType<P, RO>, handler: NotificationHandler<P>, versionProvider?: (params: P) => number): void {
    this.notificationHandlers.set(type.method, { handler, versionProvider });
  }

  /**
   * Kicks off the queue for processing.
   */
  private trigger(): void {
    if (this.timer || this.queue.length === 0) {
      return;
    }
    this.timer = setImmediate(() => {
      this.timer = undefined;
      this.processQueue();
      this.trigger();
    });
  }

  /**
   * Runs through queued messages and processes them with the associated
   * handler. Discards stale messages if needed.
   */
  private processQueue(): void {
    const message = this.queue.shift() as Notification<any>;
    if (!message) {
      return;
    }
    const elem = this.notificationHandlers.get(message.method);
    if (elem === undefined) {
      throw new Error(`No handler registered`);
    }
    if (elem.versionProvider && message.documentVersion !== undefined && message.documentVersion !== elem.versionProvider(message.params)) {
      return;
    }
    elem.handler(message.params);
  }
}
