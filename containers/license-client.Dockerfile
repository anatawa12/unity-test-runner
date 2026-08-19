# syntax=docker/dockerfile:1.25

ARG DEBIAN_RELEASE=13
ARG ICU_VERSION=76

FROM debian:${DEBIAN_RELEASE}-slim as license-client-installer

ARG ICU_VERSION
ENV ICU_VERSION ${ICU_VERSION}

RUN echo 1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl xz-utils unzip libicu${ICU_VERSION} sudo ca-certificates

RUN useradd -m admin-user

# install unity cli as a licencing client installer
RUN curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta sudo -u admin-user --preserve-env=UNITY_CLI_CHANNEL bash

# install unity licencing client
RUN sudo -u admin-user ~admin-user/.local/bin/unity license list

FROM debian:${DEBIAN_RELEASE}-slim

ARG ICU_VERSION
ENV ICU_VERSION ${ICU_VERSION}

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libicu${ICU_VERSION} libssl3 socat

COPY --from=license-client-installer --chown=0:0 /home/admin-user/.config/unityhub/external-modules/licensingClient /licensingClient
