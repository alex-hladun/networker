import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, Menu, shell } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5173';

/** @type {import('node:http').Server | null} */
let productionServer = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;

function resolveDataDir() {
	if (app.isPackaged) return path.join(app.getPath('userData'), 'data');
	return process.env.DATA_DIR || path.resolve('data');
}

function applyDataDir() {
	process.env.DATA_DIR ??= resolveDataDir();
	fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
	return process.env.DATA_DIR;
}

function installMenu(dataDir) {
	const isMac = process.platform === 'darwin';
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			...(isMac ? [{ role: 'appMenu' }] : []),
			{ role: 'fileMenu' },
			{ role: 'editMenu' },
			{ role: 'viewMenu' },
			{ role: 'windowMenu' },
			{
				role: 'help',
				submenu: [
					{
						label: 'Open data folder',
						click: () => {
							fs.mkdirSync(dataDir, { recursive: true });
							void shell.openPath(dataDir);
						}
					}
				]
			}
		])
	);
}

async function startProductionServer() {
	const handlerPath = path.join(app.getAppPath(), 'build', 'handler.js');
	const { handler } = await import(pathToFileURL(handlerPath).href);
	const server = createServer(handler);

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve(undefined));
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('The local Beacon server did not bind a port.');
	}

	const origin = `http://127.0.0.1:${address.port}`;
	await fetch(`${origin}/api/health`).catch(() => undefined);
	productionServer = server;
	return origin;
}

async function resolveAppUrl() {
	if (!app.isPackaged) return DEV_SERVER_URL;
	return startProductionServer();
}

async function createWindow() {
	const dataDir = applyDataDir();
	installMenu(dataDir);
	const appUrl = await resolveAppUrl();

	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 640,
		title: 'UniFi Beacon Monitor',
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.mjs'),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true
		}
	});

	mainWindow.once('ready-to-show', () => {
		mainWindow?.show();
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith(appUrl)) return { action: 'allow' };
		void shell.openExternal(url);
		return { action: 'deny' };
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	await mainWindow.loadURL(appUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
} else {
	app.setName('UniFi Beacon Monitor');
	app.on('second-instance', () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	app.whenReady().then(() => createWindow());

	app.on('window-all-closed', () => {
		app.quit();
	});

	app.on('before-quit', () => {
		productionServer?.close();
		productionServer = null;
	});
}
