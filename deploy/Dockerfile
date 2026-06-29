FROM nginx:alpine
COPY web/index.html /usr/share/nginx/html/index.html
COPY android/app/build/outputs/apk/release/app-release.apk /usr/share/nginx/html/apk/app-release.apk
COPY dist /usr/share/nginx/html/dist
EXPOSE 80
