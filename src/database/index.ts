import { Database, Statement } from 'bun:sqlite';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { config } from '../config';
import { askQuestion } from '../utils/readline';
import {
    EMOJI_SUCCESS,
    EMOJI_ERROR,
    EMOJI_INFO,
    type Subforum,
    type Thread,
    type Post,
    type File
} from '../types/types';

let db: Database | null = null;

export function getDatabase(): Database {
    if (!db) {
        db = new Database(config.DATABASE_PATH, {
            create: true,
            readwrite: true
        });

        // Enable WAL and set recommended pragmas for concurrent access
        db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA synchronous = NORMAL;
        `);
    }
    return db;
}

export async function initialiseDatabase(): Promise<void> {
    if (existsSync(config.DATABASE_PATH)) {
        const answer = await askQuestion('Database exists. Delete and recreate? (y/N) ');
        if (answer.trim().toLowerCase() === 'y') {
            await unlink(config.DATABASE_PATH);
            console.log(`${EMOJI_SUCCESS} Database reset.`);
            db = new Database(config.DATABASE_PATH, { create: true, readwrite: true });
            await setupDatabase(); // Only setup if deleting/recreating
        } else {
            console.log(`${EMOJI_INFO} Using existing database.`);
            getDatabase(); //  Get connection, even if not deleting
        }
    } else {
        getDatabase();  // Create DB file if it doesn't exist
        await setupDatabase(); // And create tables
    }
}

export async function setupDatabase(): Promise<void> {
    const currentDB = getDatabase();
    try {
        currentDB.exec(`
            CREATE TABLE IF NOT EXISTS subforums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                parent_id INTEGER,
                FOREIGN KEY (parent_id) REFERENCES subforums(id)
            );
            CREATE TABLE IF NOT EXISTS threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subforum_url TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                creator TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (subforum_url) REFERENCES subforums(url)
            );
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_url TEXT NOT NULL,
                username TEXT NOT NULL,
                comment TEXT NOT NULL,
                posted_at TEXT NOT NULL,
                user_url TEXT,
                FOREIGN KEY (thread_url) REFERENCES threads(url)
            );
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                first_seen TEXT NOT NULL,
                post_count INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT,
                file_data BLOB NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts(id)
            );
        `);
        console.log(`${EMOJI_SUCCESS} Database setup completed.`);
        if (!validateTables()) {
            throw new Error("Database validation failed");
        }
    } catch (error) {
        console.error(`${EMOJI_ERROR} Failed to setup database:`, error);
        await closeDatabase();
        process.exit(1);
    }
}

function validateTables(): boolean {
    const currentDB = getDatabase();
    const tables = ['subforums', 'threads', 'posts', 'users', 'files'];
    const existingTables = currentDB.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const existingTableNames = new Set(existingTables.map(t => t.name));
    const missingTables = tables.filter(table => !existingTableNames.has(table));

    if (missingTables.length > 0) {
        console.error(`${EMOJI_ERROR} Missing required tables: ${missingTables.join(', ')}`);
        return false;
    }

    console.log(`${EMOJI_SUCCESS} Database tables validated.`);
    return true;
}

export async function getSubforums(parentId: number | null = null): Promise<Subforum[]> {
    const currentDB = getDatabase();
    let stmt: Statement;
    if (parentId === null) {
        stmt = currentDB.prepare("SELECT id, title, url, parent_id as parentId FROM subforums WHERE parent_id IS NULL");
    } else {
        stmt = currentDB.prepare("SELECT id, title, url, parent_id as parentId FROM subforums WHERE parent_id = ?");
    }
    return await stmt.all(parentId) as Subforum[];
}

export async function getThreadsBySubforum(subforumUrl: string): Promise<Thread[]> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare("SELECT id, subforum_url as subforumUrl, title, url, creator, created_at as createdAt FROM threads WHERE subforum_url = ?");
    return await stmt.all(subforumUrl) as Thread[];
}

export async function getPostsByThread(threadUrl: string): Promise<Post[]> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare("SELECT id, thread_url as threadUrl, username, comment, posted_at as postedAt, user_url as userUrl FROM posts WHERE thread_url = ? ORDER BY posted_at ASC");
    return await stmt.all(threadUrl) as Post[];
}

export async function getThreadsCountBySubforum(subforumUrl: string): Promise<number> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare("SELECT COUNT(*) as count FROM threads WHERE subforum_url = ?");
    const result = await stmt.get(subforumUrl) as { count: number };
    return result.count;
}

export async function getPostsCountBySubforum(subforumUrl: string): Promise<number> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare(`
        SELECT COUNT(*) as count
        FROM posts
        INNER JOIN threads ON posts.thread_url = threads.url
        WHERE threads.subforum_url = ?
    `);
    const result = await stmt.get(subforumUrl) as { count: number };
    return result.count;
}

export async function getUsersCountBySubforum(subforumUrl: string): Promise<number> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare(`
        SELECT COUNT(DISTINCT posts.username) as count
        FROM posts
        INNER JOIN threads ON posts.thread_url = threads.url
        WHERE threads.subforum_url = ?
    `);
    const result = await stmt.get(subforumUrl) as { count: number };
    return result.count;
}

export async function getUsersCountByThread(threadUrl: string): Promise<number> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare(`
        SELECT COUNT(DISTINCT username) AS count FROM posts WHERE thread_url = ?
    `);
    const result = await stmt.get(threadUrl) as { count: number };
    return result.count;
}

export async function getFilesByPostId(postId: number): Promise<File[]> {
    const currentDB = getDatabase();
    const stmt = currentDB.prepare("SELECT id, post_id as postId, filename, mime_type as mimeType, file_data as fileData FROM files WHERE post_id = ?");
    return await stmt.all(postId) as File[];
}

export async function insertSubforum(title: string, url: string, parentId: number | null = null): Promise<Subforum> {
    const currentDB = getDatabase();
    try {
        const stmt = currentDB.prepare("INSERT OR IGNORE INTO subforums (title, url, parent_id) VALUES (?, ?, ?)");
        const result = stmt.run(title, url, parentId);
        let id = result.lastInsertRowid;

        if (typeof id !== 'number' || id === 0) {
            const existingStmt = currentDB.prepare("SELECT id, title, url, parent_id as parentId FROM subforums WHERE url = ?");
            const existingSubforum = await existingStmt.get(url) as Subforum | undefined;

            if (!existingSubforum) {
                throw new Error(`Failed to insert subforum and could not retrieve existing ID for URL: ${url}`);
            }
            return existingSubforum;
        }
        return { id, title, url, parentId };
    } catch (error) {
        console.error(`${EMOJI_ERROR} Failed to process subforum:`, error);
        throw error;
    }
}

export function insertThread(subforumUrl: string, title: string, url: string, creator: string, createdAt: string): void {
    const currentDB = getDatabase();
    try {
        const stmt = currentDB.prepare("INSERT OR IGNORE INTO threads (subforum_url, title, url, creator, created_at) VALUES (?, ?, ?, ?, ?)");
        stmt.run(subforumUrl, title, url, creator, createdAt);
    } catch (error) {
        console.error(`${EMOJI_ERROR} Failed to process thread:`, error);
        throw error;
    }
}

export function insertPost(threadUrl: string, username: string, comment: string, postedAt: string, userUrl: string): number {
    const currentDB = getDatabase();
    try {
        const stmt = currentDB.prepare("INSERT OR IGNORE INTO posts (thread_url, username, comment, posted_at, user_url) VALUES (?, ?, ?, ?, ?)");
        const result = stmt.run(threadUrl, username, comment, postedAt, userUrl);
        trackUser(username, postedAt);
        return result.lastInsertRowid as number;
    } catch (error) {
        console.error(`${EMOJI_ERROR} Failed to process post:`, error);
        throw error;
    }
}

function runWithArrayBuffer(stmt: any, ...params: any[]) {
    if (params.length > 0 && params[params.length - 1] instanceof ArrayBuffer) {
        params[params.length - 1] = new Uint8Array(params[params.length - 1]);
    }
    return stmt.run(...params);
}

export async function insertFile(postId: number, filename: string, mimeType: string | null, fileData: ArrayBuffer): Promise<File> {
    const currentDB = getDatabase();
    try {
        const stmt = currentDB.prepare("INSERT INTO files (post_id, filename, mime_type, file_data) VALUES (?, ?, ?, ?)");
        const result = runWithArrayBuffer(stmt, postId, filename, mimeType, fileData);
        const id = result.lastInsertRowid;
        if (typeof id !== 'number') {
            throw new Error("Failed to insert file and retrieve ID");
        }
        return { id, postId, filename, mimeType, fileData };
    } catch (error) {
        console.error(`${EMOJI_ERROR} Failed to process file:`, error);
        throw error;
    }
}

export function trackUser(username: string, postedAt: string): void {
    const currentDB = getDatabase();
    try {
        const stmt = currentDB.prepare(`
            INSERT INTO users (username, first_seen, post_count)
            VALUES (?, ?, 1)
            ON CONFLICT(username) DO UPDATE SET
            post_count = post_count + 1
        `);
        stmt.run(username, postedAt);
    } catch (error) {
        console.error(`${EMOJI_ERROR} Failed to track user:`, error);
        throw error;
    }
}

export function getUserCount(): number {
    const currentDB = getDatabase();
    return (currentDB.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count;
}

export async function closeDatabase(): Promise<void> {
    if (db) {
        await db.close();
        console.log(`${EMOJI_SUCCESS} Database connection closed.`);
        db = null;
    }
}
