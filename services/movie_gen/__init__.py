"""
Movie / Short-film generation pipeline.

Mirrors comic_gen architecture: script → images/audio → video → assembly.
"""

from services.movie_gen.movie_types import (
    Character,
    MovieGenre,
    MovieOutput,
    MovieScript,
    RenderedScene,
    Scene,
    SceneType,
    Shot,
)
from services.movie_gen.engine import generate_movie
from services.movie_gen.script_engine import generate_script

__all__ = [
    "Character",
    "MovieGenre",
    "MovieOutput",
    "MovieScript",
    "RenderedScene",
    "Scene",
    "SceneType",
    "Shot",
    "generate_movie",
    "generate_script",
]
