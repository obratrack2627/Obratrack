#!/usr/bin/env node
const fs=require('node:fs');const {curate}=require('./lib/obrabot-curation.cjs');
if(require.main===module){
 const [input,trainFile,validationFile]=process.argv.slice(2);
 if(!input||!trainFile||!validationFile)throw Error('Uso: curate-obrabot-sft.cjs revisadas.json train.jsonl validation.jsonl');
 const result=curate(JSON.parse(fs.readFileSync(input,'utf8')));
 for(const [name,records]of [[trainFile,result.train],[validationFile,result.validation]])fs.writeFileSync(name,records.map(JSON.stringify).join('\n')+(records.length?'\n':''),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({train:result.train.length,validation:result.validation.length,rejected:result.rejected}));
}
