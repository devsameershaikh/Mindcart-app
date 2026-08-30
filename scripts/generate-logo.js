const fs = require("fs");
const path = require("path");

const inputFile = path.join(__dirname, "../assets/icon.png"); // Update this path if your logo asset is located elsewhere
const outputFile = path.join(__dirname, "../assets/logoBase64.js");

const image = fs.readFileSync(inputFile);
const base64 = image.toString("base64");

const output = `// AUTO-GENERATED FILE - DO NOT EDIT
export default "${base64}";
`;

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output);

console.log("✅ Logo Base64 generated successfully");
console.log(`📦 Source: ${inputFile}`);
console.log(`📄 Output: ${outputFile}`);
console.log(`📏 Base64 size: ${base64.length} characters`);