#!/usr/bin/env python3
import uvicorn

if __name__ == "__main__":
    uvicorn.run("src.api.server:app", host="0.0.0.0", port=8765, reload=False)
