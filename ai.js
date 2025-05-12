import { Together } from "together-ai";

const together = new Together({ apiKey: process.env.TOGETHER_KEY });

const defaultOptions = {
  temperature: 0.7,
  top_p: 0.7,
  top_k: 50,
  repetition_penalty: 1,
  stop: ["<｜end▁of▁sentence｜>"],
  stream: false,
};

async function callModel({ model, messages }) {
  console.log("....call callTogetherAPI....");
  const response = await together.chat.completions.create({
    model,
    messages,
    ...defaultOptions,
  });
  return response.choices[0].message.content;
}

export async function extractTextFromImage(imageUrl) {
  const messages = [
    {
      role: "system",
      content:
        `Bạn là một chuyên gia Toán học. 
        Hãy phân tích cả văn bản và hình minh họa toán học (biểu đồ, đồ thị, bảng, v.v.) trong ảnh. 
        Trích xuất đầy đủ đề bài toán, bao gồm cả các đường cong, nhãn trục, điểm đặc biệt, tên hàm số nếu có thể nhìn thấy.`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Ảnh này chứa đề bài Toán học viết bằng tiếng Việt. 
          Hãy trích xuất đầy đủ nội dung đề bài, bao gồm các biểu đồ hoặc hình minh họa nếu có.`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ];
  return await callModel({
    model: "Qwen/Qwen2-VL-72B-Instruct",
    messages,
  });
}

export async function solveMath(problem) {
  const prompt = `Hãy giải bài toán sau và trả lời **đúng theo định dạng yêu cầu**:

1. Dòng đầu tiên: tóm tắt ngắn gọn đề bài bằng tiếng Việt, không dùng latex.
2. Dòng cuối cùng: ghi kết quả ngắn gọn bằng tiếng Việt, không dùng latex.
3. Các dòng còn lại: trình bày lời giải chi tiết, CÓ THỂ dùng LaTeX nếu cần.

Bài toán: ${problem}`;

  const messages = [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: prompt },
  ];

  return await callModel({
    model: "deepseek-ai/DeepSeek-V3",
    messages,
  });
}
