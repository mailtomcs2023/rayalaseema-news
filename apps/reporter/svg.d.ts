// Tell TypeScript that `import Foo from "./x.svg"` returns a React component,
// matching what react-native-svg-transformer produces at build time.
declare module "*.svg" {
  import type React from "react";
  import type { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}
