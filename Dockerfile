# Static site served by nginx. Build: docker build -t periodic-table-builder .
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html builder.html /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY data/elements.json /usr/share/nginx/html/data/elements.json

# Cache busting: stamp ?v=<hash of the assets and data> onto every asset URL (in the pages, the
# imports between modules, and the data fetch). Each deploy that changes a file gets new URLs, so
# stale copies in Cloudflare's or a browser's cache are never used. The source files stay unversioned.
RUN cd /usr/share/nginx/html \
 && V=$(find assets data -type f | sort | xargs cat | md5sum | cut -c1-10) \
 && sed -i -E "s#((href|src)=\"assets/[^\"?]+\.(css|js|svg))\"#\1?v=$V\"#g" index.html builder.html \
 && sed -i -E "s#(from '\./[^'?]+\.js)'#\1?v=$V'#g; s#(elements\.json)'#\1?v=$V'#g" assets/js/*.js \
 && echo "asset version $V"
EXPOSE 80
