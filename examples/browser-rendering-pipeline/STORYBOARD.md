# Storyboard spine

The learner follows one highlighted element from source text to a final pixel.
Each scene keeps that element visually persistent while changing the system
framing:

1. source and parser station;
2. DOM/CSSOM merge;
3. layout constraint solver;
4. paint-order stack;
5. compositing layers;
6. frame presentation and the reasons work may repeat.

Transitions communicate continuity: the same element moves into the next stage.
