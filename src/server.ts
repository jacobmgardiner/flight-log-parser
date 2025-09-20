import 'dotenv/config';
import cors from 'cors';
import express, { Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

// ----- Config & helpers -----
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 2);
const PARSE_TIMEOUT_MS = Number(process.env.PARSE_TIMEOUT_MS || 180_000);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
const RATE_MAX = Number(process.env.RATE_MAX || 30);

// Simple in-process semaphore
let active = 0;
const queue: Array<() => void> = [];
function withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const job = async () => {
            active++;
            try { resolve(await fn()); }
            catch (e) { reject(e); }
            finally {
                active--;
                const next = queue.shift();
                if (next) next();
            }
        };
        if (active < MAX_CONCURRENCY) job(); else queue.push(job);
    });
}

// Multer: stream upload straight to disk (avoid buffering in RAM)
const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
    }),
    limits: { fileSize: 1024 * 1024 * 400 } // 400MB
});

// ----- App -----
const app = express();

// CORS: allow your dev app (or all during dev)
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || true,
    credentials: false
}));

// Behind proxies (LB/Ingress), ensure correct client IP for rate limit
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

// Basic rate limiter (per-IP)
const parseLimiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: RATE_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

app.get('/healthz', (_req: Request, res: Response) => res.send('ok'));

app.post('/parse', parseLimiter, upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send('Missing file');
    if (!process.env.SDK_KEY) return res.status(500).send('SDK_KEY not set');

    const filePath = (req.file as Express.Multer.File).path;

    try {
        await withSemaphore(async () => {
            const child = spawn('/usr/local/bin/FRSample', [filePath], {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env }
            });

            // Abort / timeout safeguards
            const kill = () => child.kill('SIGKILL');
            req.on('aborted', kill);
            const timer = setTimeout(kill, PARSE_TIMEOUT_MS);

            // Stream JSON out
            res.type('application/json');
            child.stdout.pipe(res);

            // Log stderr for diagnostics
            child.stderr.on('data', (c: Buffer) => process.stderr.write(c));

            await new Promise<void>((resolve, reject) => {
                child.on('error', reject);
                child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FRSample exited ${code}`)));
            });

            clearTimeout(timer);
        });
    } catch (e: any) {
        if (!res.headersSent) res.status(500).send(String(e?.message ?? e));
    } finally {
        // best-effort cleanup
        rm(filePath, { force: true }).catch(() => {});
    }
});

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => console.log(`[parser-svc] http://0.0.0.0:${PORT}`));
