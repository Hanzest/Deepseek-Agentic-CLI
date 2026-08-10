# Project Overview

An introduction paragraph about the agentic CLI project and its RAG pipeline.

#tag [overview] additional details live here.

## Architecture

The system is composed of several modules including the chunker, tokenizer, and the
retrieval layer. Each module exposes a well-defined interface for downstream consumers.

## Retrieval Strategy

We use a hybrid approach combining dense embeddings with sparse BM25 scoring. The two
signals are fused using reciprocal rank fusion [hybrid] #retrieval.

# Usage Guide

Hands-on examples and setup instructions for end users.
