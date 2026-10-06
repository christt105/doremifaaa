FROM ubuntu:24.04
ARG VERSION=5.11.0
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8 HOME=/tmp
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates fontconfig fonts-dejavu-core libgtk-3-0t64 poppler-utils img2pdf python3-pypdf \
 && wget -q -O /tmp/audiveris.deb "https://github.com/Audiveris/audiveris/releases/download/${VERSION}/Audiveris-${VERSION}-ubuntu24.04-x86_64.deb" \
 && (apt-get install -y --no-install-recommends /tmp/audiveris.deb || true) \
 && sed -i "/^xdg-/d" /var/lib/dpkg/info/audiveris.postinst \
 && dpkg --configure -a \
 && test -x /opt/audiveris/bin/Audiveris \
 && rm -rf /var/lib/apt/lists/* /tmp/audiveris.deb
COPY omr.sh clean_pdf.py /usr/local/bin/
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/omr.sh"]
