// fall.js - NYTT 24/11 kvall (Jakob): fliken "Spara väderfall". Hittills bara en beskrivning av tanken:
// valja data pa ett smidigt satt (omrade, tider, kallor) och spara undan ett vaderfall for att kunna titta pa det senare.
function fallLage(nytt) {
  const pa = nytt === "fall"; $("vyFall").hidden = !pa; $("flikFall").setAttribute("aria-selected", String(pa)); document.body.classList.toggle("fall", pa);
  if (pa) $("underrubrik").textContent = "Spara väderfall · under uppbyggnad";
}
(function fallInit() {
  const b = $("flikFall"); if (!b) return;
  b.addEventListener("click", () => bytLage("fall"));
  if (typeof lage !== "undefined" && lage === "fall") fallLage("fall");
})();
