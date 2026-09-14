import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const lines = value => String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0,500);
const stamp = () => new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
const hasArabic = value => /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(value);

export function requestedArtifactType(text='') {
  const value=String(text).toLowerCase();
  if(/\b(?:xlsx|excel)\b|إكسل|اكسل|جدول بيانات/.test(value))return 'xlsx';
  if(/\b(?:docx|word)\b|وورد|ملف ورد/.test(value))return 'docx';
  if(/\bpdf\b|بي\s?دي\s?اف|تقرير/.test(value))return 'pdf';
  return null;
}

function writePdfLine(doc,value,{size=12,color='#222222',left=doc.page.margins.left,right=doc.page.width-doc.page.margins.right}={}) {
  const text=String(value);doc.fontSize(size).fillColor(color);
  if(!hasArabic(text)){doc.text(text,left,doc.y,{align:'left',width:right-left,lineGap:5});return;}
  const tokens=text.trim().split(/\s+/),gap=doc.widthOfString(' ');let x=right;
  for(const token of tokens){const width=doc.widthOfString(token);if(x-width<left){doc.y+=size*1.55;x=right;}x-=width;doc.text(token,x,doc.y,{lineBreak:false});x-=gap;}
  doc.x=left;doc.y+=size*1.55;
}

async function makePdf(title,body) {
  const doc=new PDFDocument({size:'A4',bufferPages:true,margins:{top:48,bottom:64,left:52,right:52},info:{Title:title,Author:'Reid'}});
  const chunks=[];doc.on('data',chunk=>chunks.push(chunk));
  const font=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/System/Library/Fonts/Supplemental/Arial.ttf'].find(existsSync);if(font)doc.font(font);
  doc.save().rect(0,0,doc.page.width,130).fill('#2B1D3C').restore();doc.y=48;
  writePdfLine(doc,title,{size:22,color:'#FFFFFF',left:90});doc.y=154;
  for(const line of lines(body)){
    if(doc.y>doc.page.height-90)doc.addPage();
    const heading=/^#{1,3}\s+/.test(line),bullet=/^[-*•]\s+/.test(line),clean=line.replace(/^[-*#•]+\s*/,'');
    writePdfLine(doc,clean,{size:heading?15:11.5,color:heading?'#5E3F9E':'#222222',left:bullet?70:52,right:doc.page.width-52});doc.y+=heading?10:5;
  }
  const range=doc.bufferedPageRange();for(let page=range.start;page<range.start+range.count;page++){doc.switchToPage(page);doc.fontSize(8).fillColor('#776C82').text('Reid • reidpro.com',52,doc.page.height-42,{lineBreak:false});doc.text(`${page-range.start+1} / ${range.count}`,doc.page.width-102,doc.page.height-42,{width:50,align:'right',lineBreak:false});}
  doc.end();return await new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
}

async function makeDocx(title,body) {
  const paragraphs=[new Paragraph({text:title,heading:HeadingLevel.TITLE,bidirectional:true,alignment:AlignmentType.LEFT}),...lines(body).map(line=>new Paragraph({bidirectional:true,alignment:AlignmentType.LEFT,spacing:{after:140},children:[new TextRun({text:line.replace(/^[-*#•]+\s*/,''),size:24,rightToLeft:true})]}))];
  return Buffer.from(await Packer.toBuffer(new Document({creator:'Reid',title,sections:[{properties:{},children:paragraphs}]})));
}

async function makeXlsx(title,body) {
  const workbook=new ExcelJS.Workbook();workbook.creator='Reid';const sheet=workbook.addWorksheet('التقرير',{views:[{rightToLeft:true,state:'frozen',ySplit:2}]});
  sheet.mergeCells('A1:F1');const header=sheet.getCell('A1');header.value=title;header.font={bold:true,size:18,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF5E3F9E'}};header.alignment={horizontal:'right'};
  let row=3;for(const line of lines(body)){const values=line.includes('|')?line.split('|').map(value=>value.trim()).filter(Boolean):[line];if(values.length>1&&values.every(value=>/^:?-{3,}:?$/.test(value)))continue;values.slice(0,6).forEach((value,index)=>{sheet.getRow(row).getCell(index+1).value=value.replace(/^[-*#•]+\s*/,'');});sheet.getRow(row).alignment={horizontal:'right',vertical:'top',wrapText:true};row++;}
  for(let column=1;column<=6;column++)sheet.getColumn(column).width=column===1?42:22;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function generateArtifact(type,body,title='تقرير ريّد') {
  if(!['pdf','docx','xlsx'].includes(type))throw new Error('unsupported_artifact_type');
  const buffer=type==='pdf'?await makePdf(title,body):type==='docx'?await makeDocx(title,body):await makeXlsx(title,body);
  const meta={pdf:['application/pdf','pdf'],docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx']}[type];
  return {buffer,mimetype:meta[0],fileName:`Reid-${stamp()}.${meta[1]}`};
}
