#!/usr/bin/env bash

set -xe

update:
  pnpm -w update --no-save
  pnpm dedupe

fcommit:
  git commit -n

push:
  git push -u $@ origin HEAD

fpush:
  git push --no-verify $@

d:
  pnpm run dev

t:
  pnpm run test $@

fmt:
  pnpm run format

fcheck:
  pnpm run format:check

lint:
  pnpm run lint

flint:
  pnpm run lint:fix

tu:
  pnpm run test $@ -- -u

b:
  pnpm run build $@

c:
  pnpm run check $@

p:
  pnpm run preview

image:
  docker build -t electric-form .

run-image:
  docker run --rm -p 3000:3000 electric-form $@

cs:
  pnpm changeset

h:
  mk -P targets "*"
