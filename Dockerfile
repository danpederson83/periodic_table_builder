# Static site served by nginx. Build: docker build -t periodic-table-builder .
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html builder.html /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY data/elements.json /usr/share/nginx/html/data/elements.json
EXPOSE 80
