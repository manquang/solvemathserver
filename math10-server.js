// Import the framework and instantiate it

import "dotenv/config";
import Fastify from "fastify";
import cloudinary from "./cloudinaryConfig.js";
import { Readable } from "stream";

const fastify = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024 * 2,
});

import Together from "together-ai";

import { marked } from "marked";
import fs from "node:fs";

import { init } from "@paralleldrive/cuid2";

const createId = init({
  // A custom random function with the same API as Math.random.
  // You can use this to pass a cryptographically secure random function.
  random: Math.random,
  // the length of the id
  length: 10,
  // A custom fingerprint for the host environment. This is used to help
  // prevent collisions when generating ids in a distributed system.
  fingerprint: "a-custom-host-fingerprint",
});

const together = new Together({ apiKey: process.env.TOGETHER_KEY });

const PORT = process.env.PORT || 6600;
const HOST = process.env.HOST || "0.0.0.0";

async function callTogetherAPI(messages, model) {
  console.log("....call callTogetherAPI....");
  const response = await together.chat.completions.create({
    messages: messages,
    //model: "deepseek-ai/DeepSeek-V3",
    model: model,
    max_tokens: null,
    temperature: 0.7,
    top_p: 0.7,
    top_k: 50,
    repetition_penalty: 1,
    stop: ["<｜end▁of▁sentence｜>"],
    stream: false,
  });

  let result = response.choices[0].message.content;
  return result;
}

function md2html(markdownContent) {
  markdownContent = markdownContent.replaceAll("[", "\\[");
  markdownContent = markdownContent.replaceAll("]", "\\]");

  markdownContent = markdownContent.replaceAll("(", "\\(");
  markdownContent = markdownContent.replaceAll(")", "\\)");
  markdownContent = markdownContent.replaceAll("\\n", "");

  //markdownContent = markdownContent.replaceAll("\n", "");

  // Chuyển đổi sang HTML
  let htmlContent = marked.parse(markdownContent);

  let templateHTML = fs.readFileSync("template.html", "utf8");
  htmlContent = templateHTML.replace("{content}", htmlContent);

  // Ghi vào file HTML
  //let outFile = "out.html"
  //fs.writeFileSync(outFile, htmlContent);

  //console.log('Chuyển đổi thành công! Kiểm tra file output.html');
  return htmlContent;
}

function uploadToCloudinary(html, publicId) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(html, "utf8");
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: publicId.endsWith(".html") ? publicId : `${publicId}.html`,
        folder: "html_outputs",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    Readable.from(buffer).pipe(stream);
  });
}

function containsLaTeX(text) {
  var latexPattern = /\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+|\$\$[^$]*\$\$|\$[^$]*\$/;
  return latexPattern.test(text);
}

fastify.post("/qa", async (request, reply) => {
  const requestData = request.body;
  const input = requestData.input;
  let ocr_text = null;

  try {
    if (requestData.image_url) {
      const image_url = requestData.image_url;
      const messages = [
        {
          role: "system",
          content:
            "You are an OCR expert. Only extract and return the plain text from the image. No explanation.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract only the text from this image. No explanation.",
            },
            {
              type: "image_url",
              image_url: { url: image_url },
            },
          ],
        },
      ];
      const ocr_model = "Qwen/Qwen2-VL-72B-Instruct";
      ocr_text = await callTogetherAPI(messages, ocr_model);
    }

    const problem = ocr_text || input;

    const prompt = `Hãy giải bài toán sau và trả lời **đúng theo định dạng yêu cầu**:

    1. Dòng đầu tiên: tóm tắt ngắn gọn đề bài bằng tiếng Việt (KHÔNG dùng LaTeX, KHÔNG ghi thêm gì).
    2. Dòng thứ hai: ghi kết quả ngắn gọn bằng tiếng Việt (KHÔNG dùng LaTeX).
    3. Từ dòng thứ ba trở đi: trình bày lời giải chi tiết, CÓ THỂ dùng LaTeX nếu cần.
    4. 3 dòng đầu tiên không được có dòng trống
    
    Bài toán: ${problem}`;

    const messages = [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: prompt },
    ];

    const model = "deepseek-ai/DeepSeek-V3";

    const result = await callTogetherAPI(messages, model);

    const lines = result.trim().split(/\r?\n/);
    const summary = lines[0]?.trim() || "";
    const answerText = lines[1]?.trim() || "";
    const detail = lines.slice(2).join("\n").trim();

    let file_url = null;
    let isLatex = containsLaTeX(result);
    if (isLatex) {
      console.time("Upload");
      const htmlContent = md2html(detail);
      const uploadResult = await uploadToCloudinary(htmlContent, createId());
      file_url = uploadResult.secure_url;
      console.timeEnd("Upload");
    }

    console.log(result);

    return {
      problem,
      summary,
      result: isLatex ? answerText : answerText + detail,
      file_url,
    };
  } catch (error) {
    console.error(error);
    return reply.status(400).send({ error: error.message });
  }
});

fastify.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server is running on port ${PORT}`);
});
