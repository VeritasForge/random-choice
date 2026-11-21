// 홈 화면 아이콘과 링크 미리보기 그림의 파일을 만든다.
//
// assets/의 그림을 고친 뒤 web/ 폴더에서 `node scripts/make-icons.mjs`를 다시 돌린다.
// 만들어진 PNG는 저장소에 함께 올린다(빌드할 때 만들지 않는다).
//
// sharp는 따로 설치한 것이 아니라 Next.js가 데려온 것을 빌려 쓴다. Next.js가 이것을
// 더는 데려오지 않게 되면 이 스크립트만 돌지 않을 뿐, 이미 만들어 둔 PNG와 서비스에는 영향이 없다.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");

const outputs = [
  { from: "assets/app-icon.svg", to: "public/icon-192.png", size: 192 },
  { from: "assets/app-icon.svg", to: "public/icon-512.png", size: 512 },
  // 아이폰용. Next.js가 app/apple-icon.png라는 이름을 보고 <link>를 스스로 넣는다.
  { from: "assets/app-icon.svg", to: "app/apple-icon.png", size: 180 },
  { from: "assets/app-icon-maskable.svg", to: "public/icon-maskable-512.png", size: 512 },
  // 링크를 붙였을 때 나오는 그림. Next.js가 app/opengraph-image.png라는 이름을 보고 <meta>를 스스로 넣는다.
  { from: "assets/og-image.svg", to: "app/opengraph-image.png", width: 1200, height: 630 },
];

for (const { from, to, size, width = size, height = size } of outputs) {
  // density를 넉넉히 주어 SVG를 크게 그린 뒤 줄인다. 기본값으로 읽으면 104px로 그린 것을
  // 늘리게 되어 선이 흐려진다.
  await sharp(join(web, from), { density: 600 }).resize(width, height).png().toFile(join(web, to));
  console.log(`${to} (${width}×${height})`);
}
