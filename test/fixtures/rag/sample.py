"""Sample Python module with functions and a class for chunking tests."""

import os
import sys


def build_greeting(name, punctuation="!"):
    """Return a personalized greeting for the given name."""
    return f"Hello, {name}{punctuation}"


def compute_area(width, height):
    """Return the area of a rectangle given its dimensions."""
    return width * height


class Vector:
    """A minimal 2D vector implementation."""

    def __init__(self, x, y):
        self.x = x
        self.y = y

    def magnitude(self):
        """Return the Euclidean magnitude of the vector."""
        return (self.x ** 2 + self.y ** 2) ** 0.5

    def add(self, other):
        """Return a new vector representing the sum of two vectors."""
        return Vector(self.x + other.x, self.y + other.y)
