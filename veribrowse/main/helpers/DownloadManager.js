import { app, session } from 'electron';
import path from 'path';
import fs from 'fs';

export class DownloadManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.downloads = new Map(); // downloadItem -> data

        this.init();
    }

    init() {
        session.defaultSession.on('will-download', (event, item, webContents) => {
            const fileName = item.getFilename() || 'download';
            const totalBytes = item.getTotalBytes();

            // Generate unique path in system Downloads folder
            let savePath = path.join(app.getPath('downloads'), fileName);
            let index = 1;
            while (fs.existsSync(savePath)) {
                const ext = path.extname(fileName);
                const base = path.basename(fileName, ext);
                savePath = path.join(app.getPath('downloads'), `${base} (${index++})${ext}`);
            }

            item.setSavePath(savePath);
            const finalFileName = path.basename(savePath);
            const downloadId = Date.now().toString();

            // Notify Renderer: Start
            this.sendToRenderer('download:start', {
                id: downloadId,
                fileName: finalFileName,
                totalBytes,
                startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            item.on('updated', (event, state) => {
                if (state === 'progressing' && !item.isPaused()) {
                    this.sendToRenderer('download:progress', {
                        fileName: finalFileName,
                        receivedBytes: item.getReceivedBytes(),
                        totalBytes: item.getTotalBytes()
                    });
                }
            });

            item.on('done', (event, state) => {
                const success = state === 'completed';
                this.sendToRenderer('download:complete', {
                    fileName: finalFileName,
                    success,
                    state
                });
            });
        });
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

export default DownloadManager;
