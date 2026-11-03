# Attic reward tooltip review

The `attic-boss-reward` snapshot includes “Untouched. Active while you lost no Courage during the previous enemy turn.” before the HUD and a full Untouched panel after the reward controls. This alone does not establish a stale combat tooltip: that reward offers Spectral Scratch, whose displayed rule uses Untouched.

Source inspection found existing cleanup at both `scene:leaving` and `scene:entered` in `ui/tooltip.js`, plus an explicit `tooltip.hide()` in `CombatScene.exit()`. `hide()` clears the pending timer, placement frame, primary/sub panels, anchor association, and screen-reader live text. `SceneManager` emits those exact lifecycle names. The reward's card pointer/focus handlers independently emit `card:hover`, which can legitimately open the same keyword description. The apparent text repetition is consistent with the live-region announcement plus the visible panel.

The parent reported that the tooltip disappeared on the next click and the expedition continued into Kitchens. Its anchor was not captured while open, so this observation remains inconclusive. No lifecycle source change was made and no new browser was opened. If it recurs, inspect `ctx.tooltip._anchor.isConnected`, the anchor's closest `.scene`, its `outerHTML`, and the tooltip's `dataset.kind` before moving the pointer; that will distinguish a current reward hover from an obsolete anchor.

Related follow-through: the parent verified the new Atlas unknown-Companion wording live at the Kitchens offer. Since Taffy was already freed, an unassigned fallback remains accurately described without claiming the wing is empty.
