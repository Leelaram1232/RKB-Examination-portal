/**
 * One-time helper: copy .env.example → .env.local if .env.local is missing.
 * Run: npm run setup:env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const target = path.join(root, '.env.local');
const example = path.join(root, '.env.example');

if (!fs.existsSync(example)) {
  console.error('Missing .env.example');
  process.exit(1);
}
if (fs.existsSync(target)) {
  console.log('.env.local already exists — not overwriting. Edit it with your VITE_* keys.');
  process.exit(0);
}
fs.copyFileSync(example, target);
console.log('Created .env.local from .env.example');
console.log('Next: add VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (anon), save, then npm run dev');
