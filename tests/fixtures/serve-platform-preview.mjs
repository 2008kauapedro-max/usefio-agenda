import express from 'express';
import { resolve } from 'node:path';
const app=express();
app.use(express.static(resolve('work/platform-preview')));
app.use((_req,res)=>res.sendFile(resolve('work/platform-preview/tests/fixtures/platform-preview.html')));
app.listen(4178,'127.0.0.1',()=>console.log('Isolated platform fixture: http://127.0.0.1:4178/platform'));
