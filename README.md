nodebuild
=========

Tests building your project against a large collection of Node versions (currently 43!)

Creates a file `output.md` which contains all of the output for each build in a nice markdown file.

# Usage

Create a `Dockerfile` for your project that includes your build steps

Then simply run:

    nodebuild build

If you are interested in seeing which versions of Node this will test against, run

    nodebuild list

# Installation

    git clone https://github.com:wblankenship/dockerbuild.git
    cd dockerbuild
    npm link

# Dependencies

* Docker
* Node
