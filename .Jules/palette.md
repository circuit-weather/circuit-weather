## 2024-03-24 - Custom Input Focus States
**Learning:** `appearance: none` on input elements (like range sliders) removes all default browser styles, including the focus ring. This leaves keyboard users stranded without visual feedback.
**Action:** Always verify focus states when styling custom inputs. Manually reimplement focus rings using `:focus-visible` and `box-shadow` (for rounded elements) or `outline`. For range inputs, the focus style often needs to be applied to the `::-webkit-slider-thumb` pseudo-element if the track is also styled or hidden.
