# AgentPup design notes

AgentPup is a small navy-and-cream puppy that connects three ideas in one
silhouette: a friendly pet, an AI agent, and an attentive watcher. The short
forehead antenna and mint collar light carry the agent identity without making
the character feel mechanical. Large ears, a clear face, and compact paws keep
the pet readable at its normal desktop size.

## Status poses

- **Idle:** seated, calm, and alert. The antenna and collar remain visible.
- **Working:** a focused raised-paw pose with a gentle breathing loop.
- **Needs you:** a direct wave and brighter posture. Motion is stronger than
  the other states so the request remains recognizable without relying on red.
- **Ready:** a joyful hop for a finished result. The shared UI supplies the
  persistent result count after the short celebration.
- **Concern:** lowered ears and posture for interruption or an uncertain state.
- **Walking:** a side-facing step used by roaming-capable renderers.

The runtime atlas uses the OpenPets V2 geometry: 192 by 208 pixel cells in an
8-column by 11-row sheet. AgentPup's status badge and agent counts remain shared
UI; they are deliberately absent from the character art.

## Review scenarios

Review the pet at the default desktop scale on light and dark application
backgrounds. Confirm that the feet stay grounded, the silhouette does not jump
between state changes, the wave reads as a request, and the hop reads as a
result. Also review with animation disabled, reduced motion enabled, the status
rail on either side, and two display scale factors.
