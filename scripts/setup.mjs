import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const serverEnv=path.join(root,'server','.env');
const clientEnv=path.join(root,'client','.env');
if(!fs.existsSync(serverEnv)){
 const template=fs.readFileSync(path.join(root,'server','.env.example'),'utf8');
 fs.writeFileSync(serverEnv,template.replace('replace-with-a-strong-random-32-plus-character-value',crypto.randomBytes(48).toString('hex')).replace('replace-with-a-64-character-hex-key',crypto.randomBytes(32).toString('hex')),{mode:0o600});
 console.log('Created server/.env with cryptographically random secrets');
}else console.log('server/.env already exists; leaving secrets untouched');
if(!fs.existsSync(clientEnv)){
 fs.copyFileSync(path.join(root,'client','.env.example'),clientEnv);
 console.log('Created client/.env');
}else console.log('client/.env already exists');
console.log('Next: npm run db:push && npm run dev');
