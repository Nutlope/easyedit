<a href="https://www.easyedit.io/">
  <img alt="EasyEdit" src="./public/og-image.png">
  <h1 align="center">EasyEdit</h1>
</a>

<p align="center">
  Edit images with a single prompt. Powered by Flux 2 through Together.ai.
</p>

## Tech stack

- [Flux 2](https://www.together.ai/blog/flux-2-multi-reference-image-generation-now-available-on-together-ai) from BFL for the image model
- [Together AI](https://togetherai.link/?utm_source=easyedit&utm_medium=referral&utm_campaign=example-app) for inference
- Next.js app router with Tailwind
- Helicone for observability
- Plausible for website analytics

## Cloning & running

1. Clone the repo: `git clone https://github.com/Nutlope/easyedit`
2. Create a `.env.local` file and add your [Together AI API key](https://togetherai.link/?utm_source=easyedit&utm_medium=referral&utm_campaign=example-app): `TOGETHER_API_KEY=`
3. Run `npm install` and `npm run dev` to install dependencies and run locally
