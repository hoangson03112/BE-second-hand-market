// services/imageModeration.utils.js
const axios = require("axios");

const DEEPAI_KEY = process.env.DEEPAI_KEY;

async function nsfwCheck(imageUrl) {
  const res = await axios.post(
    "https://api.deepai.org/api/nsfw-detector",
    { image: imageUrl },
    { headers: { "Api-Key": DEEPAI_KEY } }
  );

  const output = res.data.output;
  const nsfwScore = output.nsfw_score || 0; // 0: an toàn, 1: cực kỳ NSFW
  return nsfwScore;
}

module.exports = nsfwCheck;
