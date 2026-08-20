# AIC2026 Retrieval Frontend Starter
## Overview
This web is designed to support our research method in multimodal zero-shot keyframe-based video moment retrieval (VMR).

The web is comprised on 2 main components:
- `BackEnd/`: where the entire pipeline and the web's API stay
- `FrontEnd/`: an interactive frontend that supports multi-purposed and cooperative retrieval experience.

## Run

Clone the repository and move to the folder:

```bash
cd Determinatives-HCMCAIC26
```

Install the dependencies of the back-end:

```bash
pip install -r BackEnd/requirements.txt
```

(INTERNAL INSTRUCTION, REMOVE AFTER CONTEST) Download the dataset and run the uploading script as in the `example.ipynb`:

Install front-end's dependencies and run the front-end setup

```bash
npm --prefix FrontEnd install
npm --prefix FrontEnd run start:all
```

Then open the Vite URL, usually http://localhost:5173.