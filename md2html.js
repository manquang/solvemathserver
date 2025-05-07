
import { marked } from "marked";

// Cấu hình marked để không làm thay đổi các ký tự đặc biệt
// marked.setOptions({
//     sanitize: false, // Tắt tính năng sanitize để giữ nguyên LaTeX
//     highlight: function (code, lang) {
//       // Tùy chọn highlight code (nếu cần)
//       return code;
//     },
//   });


import fs from 'node:fs';
let markdownContent=''
try {  
  markdownContent = fs.readFileSync('markdownContent.md', 'utf8');
} catch (err) {
  console.error(err);
}

markdownContent = markdownContent.replaceAll("\[", "\\[");
markdownContent = markdownContent.replaceAll("\]", "\\]");

markdownContent = markdownContent.replaceAll("\(", "\\(");
markdownContent = markdownContent.replaceAll("\)", "\\)");

markdownContent = markdownContent.replaceAll("\\n", "");

console.log(markdownContent);




// Chuyển đổi sang HTML
let htmlContent = marked.parse(markdownContent);

let script = '<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3.0.1/es5/tex-mml-chtml.js"></script>';
htmlContent = script + ' ' + htmlContent;

// Ghi vào file HTML
fs.writeFileSync('md_output.html', htmlContent);

console.log('Chuyển đổi thành công! Kiểm tra file md_output.html');
