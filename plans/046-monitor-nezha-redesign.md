# Monitor Nezha Redesign
## Summary
Redesign the monitor overview to resemble Nezha dashboard by introducing a Server Matrix (Grid) containing cards with metrics visualisations. 

## Objectives
- [x] Analyze `monitor-view.tsx` layout boundaries. 
- [x] Create `ServerCard` utilizing `Progress` component.
- [x] Render metrics (CPU, RAM, Disk, System Load, Connections, Network speeeds).
- [x] Implement robust real-time updates and seamless state linkage via existing hooks.
- [x] Adjust layout positioning for impact at top-of-page.

## Technical Details
Injected a `ServerCard` inline component mapping over unified node metric states. Used the tailwind and hero UI components matching visual designs like progress bars and small monospace typograhy. Extracted utility color scales.

## Status: Complete
