ARG DENO_VERSION=1.43.1
ARG ALPINE_VERSION=3.18

FROM denoland/deno:bin-$DENO_VERSION AS deno

FROM frolvlad/alpine-glibc:alpine-$ALPINE_VERSION AS build
COPY --from=deno /deno /usr/local/bin/deno

COPY src src
COPY deno.jsonc .
COPY deno.lock .
RUN deno task compile

FROM frolvlad/alpine-glibc:alpine-$ALPINE_VERSION AS server
COPY --from=build ghosting ghosting

CMD ./ghosting
