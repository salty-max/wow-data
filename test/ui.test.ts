import { expect, test } from "bun:test";
import { type Index, type Node, parseXml, resolve, textureKey } from "../src/ui";

const xml = `<Ui>
  <!-- a comment -->
  <Frame name="Outer">
    <Frames>
      <Frame name="$parentInner" parentKey="Inner" inherits="Tpl, Other">
        <Size x="10" y="20"/>
      </Frame>
    </Frames>
  </Frame>
</Ui>`;

test("the XML reader keeps tags, attributes, nesting and lines", () => {
  const [ui] = parseXml(xml, "a.xml");
  const outer = ui!.children[0]!;
  expect(outer.attrs.name).toBe("Outer");
  expect(outer.line).toBe(3);
  expect(outer.end).toBe(9);
  const inner = outer.children[0]!.children[0]!;
  expect(inner.attrs.parentKey).toBe("Inner");
  expect(inner.line).toBe(5);
  expect(inner.children[0]!.attrs).toEqual({ x: "10", y: "20" });
});

test("a texture path is read the same with either slash, any case, with or without Interface and the extension", () => {
  const k = "interface\\icons\\inv_misc_note_01";
  expect(textureKey("Interface\\Icons\\INV_Misc_Note_01")).toBe(k);
  expect(textureKey("Interface/Icons/INV_Misc_Note_01.blp")).toBe(k);
  expect(textureKey("Icons\\INV_Misc_Note_01")).toBe(k);
});

test("a keyed path goes through containers only, never into another widget", () => {
  const [ui] = parseXml(
    `<Ui><Frame name="Top"><Frames><Frame name="$parentChild"><Frames><Button parentKey="Close"/></Frames></Frame><Button parentKey="Own"/></Frames></Frame></Ui>`,
    "a.xml",
  );
  const byName = new Map<string, Node[]>();
  const top = ui!.children[0]!;
  byName.set("top", [top]);
  const idx = { game: "classic", dir: "", byName, files: [], xmlFiles: [] } as Index;
  expect(resolve(idx, "Top.Own").found).toHaveLength(1);
  expect(resolve(idx, "Top.Close").found).toHaveLength(0);
});
