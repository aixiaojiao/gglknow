/* Rebuild store artwork from captured demo UI. See assets/store/README.md. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.GGLKNOW_SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'assets/store');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const data = file => { const bytes=fs.readFileSync(path.join(out,'source',file)); return `data:image/${bytes[0]===255?'jpeg':'png'};base64,${bytes.toString('base64')}`; };
const icon = `data:image/png;base64,${fs.readFileSync(path.join(root,'icons/icon128.png')).toString('base64')}`;
const txt = (x,y,s,size=20,color='#292638',weight=400,extra='') => `<text x="${x}" y="${y}" font-family="Inter,Helvetica Neue,PingFang SC,Arial,sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(s)}</text>`;
const base = (w,h,body,bg='#F6F3FB') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`;
const brand = (w=1280) => `<image href="${icon}" x="64" y="32" width="30" height="30"/>${txt(105,55,'GglKnow',23,'#332C4D',700)}${txt(w-64,54,'YOUR IDEAS, KEPT.',11,'#8A7B9F',600,'text-anchor="end" letter-spacing="2"')}`;
const screen = (file) => `<defs><clipPath id="screen"><rect x="56" y="184" width="1168" height="560" rx="15"/></clipPath><filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#39266B" flood-opacity=".10"/></filter></defs><rect x="56" y="184" width="1168" height="560" rx="15" fill="white" filter="url(#shadow)"/><image href="${data(file)}" x="56" y="184" width="1168" height="730" preserveAspectRatio="xMinYMin meet" clip-path="url(#screen)"/><rect x="56" y="184" width="1168" height="560" rx="15" fill="none" stroke="#DED6ED"/>`;
const copy = {
 en:{library:'Your X archive. Finally useful.',librarySub:'Save locally. Read calmly. Keep the original context.',search:'Find the thought you saved.',searchSub:'Search your words. Add your tags. Make your own collections.',export:'From a saved post to a lasting note.',exportSub:'Portable Markdown. Obsidian properties. Local images.',demo:'Example library · English + 简体中文',local:'01 / READ & ORGANIZE',find:'02 / FIND & CONNECT',files:'03 / TAKE IT WITH YOU',media:'Keep this folder with your note.',free:'HTML · JSON · MARKDOWN',tileA:'Keep the good ideas.',tileB:'Take them with you.',smallA:'Keep what matters.',smallB:'Make it your knowledge.'},
 zh:{library:'把值得留下的内容，变成自己的知识。',librarySub:'本地收藏，从容阅读。保留内容，也保留语境。',search:'想起来时，就能找得到。',searchSub:'搜索正文、作者和标签，用自己的方式整理收藏。',export:'从一条收藏，到一篇长期有用的笔记。',exportSub:'Markdown · Obsidian 属性 · 本地图片，一起带走。',demo:'演示资料库 · 简体中文 + English',local:'01 / 阅读与整理',find:'02 / 搜索与连接',files:'03 / 带入知识库',media:'请与 Markdown 文件一起移动。',free:'HTML · JSON · MARKDOWN',tileA:'把好想法留下。',tileB:'带进自己的知识库。',smallA:'把值得留下的内容，',smallB:'变成自己的知识。'}
};
(async()=>{
 for(const lang of ['en','zh']){
  const c=copy[lang],dir=path.join(out,lang,'screenshots');fs.mkdirSync(dir,{recursive:true});
  for(const [n,name,headline,sub,foot] of [['01','library',c.library,c.librarySub,c.local],['02','search',c.search,c.searchSub,c.find]]){
   const svg=base(1280,800,brand()+txt(56,117,headline,lang==='zh'?43:48,'#302943',650)+txt(58,151,sub,19,'#84768D')+screen(`${name==='library'?'reader':'search'}-${lang}.png`)+txt(58,779,foot,11,'#8A7B9F',600,'letter-spacing="1.5"')+txt(1224,779,c.demo,11,'#8A7B9F',400,'text-anchor="end"'));
   fs.writeFileSync(path.join(dir,`${n}-${name}.svg`),svg);await sharp(Buffer.from(svg)).flatten({background:'#F6F3FB'}).removeAlpha().png().toFile(path.join(dir,`${n}-${name}.png`));
  }
  const codeLines=['---','title: "A small system for better ideas"','type: "x-article"','source: "X"','author: "GglKnow Demo"','tags:','  - "x"','  - "Knowledge"','capture_scope: "loaded-page"','---','','![](media/image_1.svg)'];
  let exportBody=brand()+txt(56,117,c.export,lang==='zh'?42:46,'#302943',650)+txt(58,151,c.exportSub,19,'#84768D');
  exportBody+='<rect x="56" y="196" width="720" height="536" rx="16" fill="#302A43"/>'+txt(86,237,'article.md',16,'#D9CFF3',500)+'<path d="M86 255H746" stroke="#50445F"/>';
  codeLines.forEach((line,i)=>{exportBody+=`<text x="88" y="${292+i*31}" font-family="Menlo,Consolas,monospace" font-size="18" fill="${i===0||i===9?'#AB97DD':i===11?'#BCE8C5':'#EAE3F3'}">${esc(line)}</text>`});
  exportBody+='<rect x="812" y="196" width="412" height="248" rx="16" fill="#EAE4F5"/><rect x="812" y="468" width="412" height="264" rx="16" fill="#E9F0E9"/>';
  exportBody+=txt(846,243,lang==='zh'?'开放的文件格式':'OPEN FILE FORMATS',12,'#88749E',600,'letter-spacing="1"')+txt(846,300,'HTML',33,'#493958',650)+txt(846,349,'JSON',33,'#493958',650)+txt(846,399,'Markdown',33,'#493958',650)+txt(846,516,'media/',23,'#3D5C4B',650)+txt(846,565,'image_1.svg',17,'#678470')+txt(846,604,'image_2.jpg',17,'#678470')+txt(846,687,c.media,lang==='zh'?17:16,'#678470')+txt(58,779,c.files,11,'#8A7B9F',600,'letter-spacing="1.5"')+txt(1224,779,lang==='zh'?'示例导出 · 文件归你所有':'Example export · Your files, your control',11,'#8A7B9F',400,'text-anchor="end"');
  let svg=base(1280,800,exportBody);fs.writeFileSync(path.join(dir,'03-export.svg'),svg);await sharp(Buffer.from(svg)).flatten({background:'#F6F3FB'}).removeAlpha().png().toFile(path.join(dir,'03-export.png'));
  svg=base(1400,560,`<circle cx="1170" cy="240" r="280" fill="#E9E2F7"/><image href="${icon}" x="80" y="54" width="48" height="48"/>${txt(143,88,'GglKnow',33,'#302943',700)}${txt(80,220,c.tileA,lang==='zh'?68:61,'#302943',650)}${txt(80,302,c.tileB,lang==='zh'?68:61,'#6955CF',650)}${txt(83,385,lang==='zh'?'本地收藏 · 双语阅读 · 带入 Obsidian':'Save locally. Read in your language. Export to Obsidian.',23,'#84768D')}${txt(83,485,c.free,13,'#9180A4',600,'letter-spacing="2"')}<g transform="translate(1020 119) rotate(8)"><rect width="230" height="316" rx="22" fill="#FFFDFA" stroke="#D8CCE8"/><path d="M45 65h140M45 95h140M45 125h98" stroke="#D6CCE4" stroke-width="9" stroke-linecap="round"/><image href="${icon}" x="61" y="175" width="108" height="108"/></g>`);
  fs.writeFileSync(path.join(out,lang,'marquee.svg'),svg);await sharp(Buffer.from(svg)).removeAlpha().png().toFile(path.join(out,lang,'marquee.png'));
  svg=base(440,280,`<image href="${icon}" x="30" y="27" width="38" height="38"/>${txt(82,55,'GglKnow',27,'#302943',700)}${txt(30,130,c.smallA,lang==='zh'?27:29,'#302943',650)}${txt(30,173,c.smallB,lang==='zh'?27:24,'#6955CF',650)}${txt(32,246,'X → HTML · JSON · MARKDOWN',12,'#9180A4',500,'letter-spacing="1"')}`);
  fs.writeFileSync(path.join(out,lang,'small-tile.svg'),svg);await sharp(Buffer.from(svg)).removeAlpha().png().toFile(path.join(out,lang,'small-tile.png'));
 }
 const previews=[];for(const lang of ['en','zh'])for(const name of ['01-library','02-search','03-export'])previews.push(await sharp(path.join(out,lang,'screenshots',name+'.png')).resize(640,400).toBuffer());
 await sharp({create:{width:1920,height:800,channels:3,background:'#ece8f4'}}).composite(previews.map((input,i)=>({input,left:(i%3)*640,top:Math.floor(i/3)*400}))).png().toFile(path.join(out,'preview.png'));
 console.log('Rendered 6 localized screenshots, 4 tiles and a contact sheet.');
})().catch(e=>{console.error(e);process.exit(1)});
