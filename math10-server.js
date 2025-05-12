import "dotenv/config";
import Fastify from "fastify";
import cloudinary from "./cloudinaryConfig.js";
import { Readable } from "stream";
import fastifyMultipart from "@fastify/multipart";
import { extractTextFromImage, solveMath } from "./ai.js";
import { marked } from "marked";
import fs from "node:fs";
import { init } from "@paralleldrive/cuid2";

const createId = init({
  random: Math.random,
  length: 10,
  fingerprint: "a-custom-host-fingerprint",
});

const fastify = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024 * 2,
});

fastify.register(fastifyMultipart);

const PORT = process.env.PORT || 6600;
const HOST = process.env.HOST || "0.0.0.0";


function md2html(markdownContent) {
  markdownContent = markdownContent.replaceAll("[", "\\[");
  markdownContent = markdownContent.replaceAll("]", "\\]");

  markdownContent = markdownContent.replaceAll("(", "\\(");
  markdownContent = markdownContent.replaceAll(")", "\\)");
  markdownContent = markdownContent.replaceAll("\\n", "");


  // Chuyển đổi sang HTML
  let htmlContent = marked.parse(markdownContent);

  let templateHTML = fs.readFileSync("template.html", "utf8");
  htmlContent = templateHTML.replace("{content}", htmlContent);

  return htmlContent;
}

function uploadToCloudinary(type, buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: type,
        public_id: publicId,
        folder: "outputs",
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

fastify.post("/upload_image", async (req, reply) => {
  try {
    const data = await req.file();
    const buffer = await data.toBuffer();
    const publicId = createId();

    const uploadResult = await uploadToCloudinary("image", buffer, publicId);
    console.log(uploadResult);

    reply.send({
      img_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    });
  } catch (error) {
    console.error(error);
    reply.status(500).send({ error: "Image upload failed" });
  }
});

fastify.post("/extract_ocr", async (req, reply) => {
  try {
    const { image_url } = req.body;

    if (!image_url || typeof image_url !== "string") {
      return reply.status(400).send({ error: "Missing or invalid image_url" });
    }

    const ocrText = await extractTextFromImage(image_url);

    reply.send({ ocr_text: ocrText });
  } catch (error) {
    console.error("OCR Error:", error);
    reply.status(500).send({ error: "OCR failed" });
  }
});

fastify.delete("/delete",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          publicIds: { type: "array", items: { type: "string" } },
        },
        required: ["publicIds"],
      },
    },
  },
  async (request, reply) => {
    const { publicIds } = request.body;
    try {
      const results = await Promise.all(
        publicIds.map((id) => cloudinary.uploader.destroy(id))
      );
      reply.send({ success: true, results });
    } catch (err) {
      reply.status(500).send({ error: err.message });
    }
  }
);

fastify.post("/qa", async (request, reply) => {
  const requestData = request.body;
  const input = requestData.input;

  try {
    const result = await solveMath(input);

    const lines = result.trim().split(/\r?\n/);
    const summary = lines[0]?.trim() || "";
    const answerText = lines[lines.length - 1]?.trim() || "";
    const detail = lines.slice(1, -1).join("\n").trim();

    let file_url = null;
    let public_id = null;
    let isLatex = containsLaTeX(result);

    if (isLatex) {
      const htmlContent = md2html(detail);
      const buffer = Buffer.from(htmlContent, "utf8");

      // const fileName = `${createId()}.html`;
      // const filePath = `./outputs/${fileName}`;
      // fs.writeFileSync(filePath, md2html(input), "utf8");

      const uploadResult = await uploadToCloudinary("raw", buffer, `${createId()}.html`);
      file_url = uploadResult.secure_url;
      public_id = uploadResult.public_id;
    }

    return {
      public_id,
      summary,
      result: isLatex ? answerText : answerText + detail,
      file_url,
    };
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: error.message });
  }
});


fastify.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server is running on port ${PORT}`);
});
