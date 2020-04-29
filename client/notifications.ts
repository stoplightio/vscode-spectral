// Notifications have the same definitions/interfaces in both client and server
// with two exceptions:
// - The server has some notifications it only uses internally, so they don't
//   show up in the client.
// - The client uses `vscode-languageclient` and the server uses
//   `vscode-languageserver` for interfaces.
//
// Keeping it in a separate file like this makes it easier to find and update
// across the client and server components.

import { NotificationType } from 'vscode-languageclient';

// eslint-disable-next-line
export namespace StartWatcherNotification {
  /**
   * Notification type indicating a FileSystemWatcher should be started in the client.
   */
  export const type = new NotificationType<StartWatcherParams, void>('spectral/startWatcher');
}

export interface StartWatcherParams {
  /**
   * The path on which the FileSystemWatcher should be started.
   */
  path: string;
}
