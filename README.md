# Aurumi C.I.A. 

22. IMPORTANT — PHASED IMPLEMENTATION CONTROL

The preceding instruction set defines the complete C.I.A. Workspace v1.0 architecture and functional requirements.

Do NOT attempt to implement the entire application in one execution.

Follow these rules:

Read and understand the complete specification before beginning implementation.

Implement Phase 1 — Foundation only in this execution.

Design Phase 1 with the complete V1.0 architecture in mind, ensuring subsequent phases can be added without major restructuring.

Create only the navigation, shared components, core data models, mock repositories, integration adapter interfaces, permissions framework and application shell necessary for Phase 1.

It is acceptable to create navigation placeholders for future modules, but do not implement their functional screens or workflows yet.

Do not begin Phase 2 or any subsequent phase without my explicit authorization.

At the end of Phase 1, provide:

Summary of what was implemented.

Data models and integration interfaces created.

Screens and navigation completed.

Any architectural assumptions made.

Outstanding questions or dependencies.

Recommended scope for Phase 2.

Stop and wait for my review and approval before proceeding.

The immediate task is Phase 1 — Foundation ONLY. All other phases are provided for architectural context, not implementation authorization.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9fe7c68a-2d78-4820-818a-b6bad28abed9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
