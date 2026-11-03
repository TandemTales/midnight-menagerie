# Larger reading sizes and slower presentation

Requested: enlarge small text throughout the game, especially the blueprint menu and room information, and slow animations by roughly one third.

## Reading sizes

The shared ramp now starts at 16px rather than 10px. Fixed component sizes use a nonlinear lift (old size * .75 + 8px, with a 16px floor), giving the smallest labels the largest proportional increase while leaving large headings alone. These values live in tokens.css. Existing Large Text settings remain available.

The map toolbar has larger controls, room information panels widen to 440px, room names on the blueprint wrap onto two lines instead of shrinking to 9px, and the footer reserves its measured height so wrapped legends cannot collide with the drawing tools. Map geometry and progression are unchanged.

The HUD compacts duplicate labels into existing icons and tooltips when necessary. Selection controls wrap, rest choices scroll, Settings reflows into two columns on narrower screens, and the expedition record scrolls instead of overlapping. Card fitting uses higher reading targets; type and keyword badges keep a screen-space floor.

## Motion

BASE_ANIMATION_RATE = 2/3 applies to the central clock. CSS animation and transition durations use --anim-scale (default 1.5), composed with the player's existing speed and Fast Mode preferences. Presentation cleanup timers match their longer CSS animations. Reduced Motion also clears animation and transition delays. Audio playback, input thresholds, networking and combat rules are unchanged.

## Validation

- tests/readability/run.py: all 11 game screens at 1280x800; map menu/bubble font sizes; settings controls; Large Text maps at 1280x800 and 1600x900; actual clock rate and CSS timing through the real settings API.
- tests/blueprint/run.py: map panning, zoom, marker/eraser/undo/persistence, keyboard use and legal room entry; 68 generated plans and 3812 room states.
- CSS token and scene-style checks; JavaScript syntax and whitespace checks.

Screenshots and numeric results are saved under tests/readability/.
