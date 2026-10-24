# Japanese fallback font source check

- Google Fonts Noto Sans JP specimen: https://fonts.google.com/noto/specimen/Noto+Sans+JP
  - Official page describes Noto Sans JP as designed for Japanese, covering Hiragana, Katakana and Kanji, with multiple weights.
- Google Fonts repository directory: https://github.com/google/fonts/tree/main/ofl/notosansjp
  - Contents include `NotoSansJP[wght].ttf` and `OFL.txt`.
- Exact license downloaded from: https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/OFL.txt
  - SIL Open Font License 1.1. Preserve unchanged in `assets/fonts/NotoSansJP-OFL.txt`.
- Runtime guidance: use matching Noto JP fallback before any Chinese fallback and subset Japanese to kana plus JIS X 0208 kanji.
