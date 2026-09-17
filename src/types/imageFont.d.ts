declare module "next/dist/compiled/@next/font/dist/fontkit" {
  export default function loadFont(data: Buffer): {
    unitsPerEm: number;
    layout(text: string): { advanceWidth: number };
  };
}
