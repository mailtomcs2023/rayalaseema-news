import { renderThumbnail } from "../../src/lib/video-iq/thumbnail.ts";
import { readFileSync, writeFileSync } from "node:fs";
const frame = new Uint8Array(readFileSync((process.argv[3] ?? "test-fixtures/video-iq/frame-sample.jpg")));
const a = await renderThumbnail({ frame, headline: "ఏకగ్రీవాలపై రాచమల్లు ఫైర్", breaking: true });
writeFileSync(process.argv[2] + "/thumb-breaking.jpg", a.jpeg);
const b = await renderThumbnail({ frame, headline: "ప్రొద్దుటూరు మున్సిపల్ ఎన్నికల్లో వరదరాజుల రెడ్డిపై రాచమల్లు శివప్రసాద్ రెడ్డి తీవ్ర ఆరోపణలు", breaking: false });
writeFileSync(process.argv[2] + "/thumb-long.jpg", b.jpeg);
console.log("bytes", a.jpeg.byteLength, b.jpeg.byteLength);
