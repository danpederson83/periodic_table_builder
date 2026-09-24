# Deploying to a home server (guide for Claude)

This file is written for **Claude Code running on the owner's home server**. It's meant to guide
the owner through deploying Periodic Table Builder behind a Cloudflare Tunnel. A person can
follow it too.

The app is a static site: nginx serves `index.html`, `builder.html`, `assets/` and
`data/elements.json`. There is no backend, database or secrets, apart from the Cloudflare
tunnel token.

---

## 0. How to work through this

- Go one step at a time and confirm each step before starting the next.
- **Never ask the owner to paste the tunnel token into the chat.** Ask them to write it to `.env`
  themselves (step 4B), then check that the file exists without printing its contents.
- Before changing anything outside this repo (an existing cloudflared config, other containers,
  firewall rules), show the owner the change and get a yes first.
- Anything done in the Cloudflare dashboard has to be done by the owner. Tell them exactly
  where to click, and wait for them.

## 1. Ask the owner these questions first

1. **Hostname:** which address should the site live at? (e.g. `periodic.example.com`, where
   the domain is already on Cloudflare)
2. **Existing tunnel:** is cloudflared already running on this server for other services?
   Check before asking, so you can say what you found:
   ```sh
   systemctl status cloudflared 2>/dev/null | head -5
   docker ps --format '{{.Names}}\t{{.Image}}' | grep -i cloudflared
   ls /etc/cloudflared ~/.cloudflared 2>/dev/null
   ```
3. **Port:** is 8080 free, or do they prefer another port? Check with
   `ss -ltnp | grep ':8080 '`.

Their answer to question 2 decides the path in step 4.

## 2. Check the prerequisites

```sh
docker --version && docker compose version     # required
git --version                                  # required
node --version                                 # optional (v18+), only used to refresh data and run tests
```

If Docker or Compose is missing, help install it with the official instructions for this
distro before going on.

## 3. Get the code

The app is on the `claude/custom-periodic-table-nbiqzz` branch. Check whether it has been
merged into `main` yet:

```sh
git clone https://github.com/danpederson83/periodic_table_builder.git
cd periodic_table_builder
git branch -r                                    # see which branches exist
ls index.html || git checkout claude/custom-periodic-table-nbiqzz
```

If the clone fails with an authentication error, the repo is private. Help the owner set up
GitHub access, either with `gh auth login` or by adding this server's SSH key to their GitHub
account, and then clone with the `git@github.com:` URL.

Optionally, refresh the element data straight from PubChem. The bundled copy came from a
mirror. Either command works:

```sh
npm run data && npm test                                                     # if Node is installed
docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c "node scripts/build-data.mjs && node --test tests/*.test.mjs"   # if not
```

If PubChem can't be reached, skip this step. The bundled data works fine.

If the owner chose a port other than 8080, change `"8080:80"` in `docker-compose.yml` to match.

## 4. Deploy: pick the path that matches the answer to question 2

### 4A. cloudflared already runs on this server (most likely)

Don't start a second tunnel. Start only the web container:

```sh
docker compose up -d --build web
curl -sI http://localhost:8080 | head -1        # expect HTTP/1.1 200 OK
```

Then add a route for the new hostname to the **existing** tunnel. How you do that depends on
how that tunnel is managed:

- **Managed from the dashboard** (cloudflared runs with a `--token`, and there's no
  `config.yml` with `ingress:` rules): the owner adds the route. Tell them to go to the Cloudflare
  dashboard → **Zero Trust → Networks → Tunnels**, open their tunnel, choose **Configure**, and add a
  **public hostname**. (Newer dashboards call this a *published application route*.) Settings:
  subdomain + domain = their hostname, type `HTTP`, URL = see the note below.
- **Managed from a local config file** (`/etc/cloudflared/config.yml` or `~/.cloudflared/config.yml`
  with `ingress:` rules): show the owner the change, then add a rule *above* the catch-all
  `- service: http_status:404`:
  ```yaml
    - hostname: periodic.example.com
      service: http://localhost:8080
  ```
  Then run:
  ```sh
  cloudflared tunnel route dns <tunnel-name-or-id> periodic.example.com
  sudo systemctl restart cloudflared      # or restart its container
  ```

**Which service URL to use.** It depends on where cloudflared runs:
- cloudflared installed on the host (systemd): `http://localhost:8080`
- cloudflared in a Docker container: `localhost` there means the cloudflared container itself.
  You have two options:
  - Use the host's LAN IP: `http://192.168.x.x:8080`.
  - Better: put both containers on a shared Docker network and use `http://<web-container-name>:80`.
    Find the network with `docker inspect <cloudflared-container> -f '{{json .NetworkSettings.Networks}}'`,
    then connect the web container to it with `docker network connect <network> periodic_table_builder-web-1`.
    Check the real container name with `docker ps`.

### 4B. No tunnel yet: use the bundled cloudflared container

1. The owner creates a tunnel in the Cloudflare dashboard: **Zero Trust → Networks → Tunnels →
   Create a tunnel → Cloudflared**, and names it. On the install screen they copy **only the
   token** (the long string after `--token`).
2. The owner saves it into `.env` themselves:
   ```sh
   echo 'TUNNEL_TOKEN=paste-token-here' > .env && chmod 600 .env
   ```
   Check it without revealing it: `grep -c '^TUNNEL_TOKEN=.\+' .env` should print `1`.
3. In the same tunnel's settings, the owner adds a public hostname (or published application
   route): their hostname → type `HTTP` → URL `web:80`. This works because the two containers
   share the compose network.
4. Start both containers:
   ```sh
   docker compose up -d --build
   docker compose logs cloudflared --tail 20     # look for "Registered tunnel connection"
   ```

The owner can remove the `ports: "8080:80"` mapping if they don't want LAN access. The tunnel
doesn't need it.

## 5. Verify

```sh
curl -sI http://localhost:8080 | head -1                       # local: 200
curl -sI https://periodic.example.com | head -1                # public: 200 (DNS can take a minute)
curl -s https://periodic.example.com/data/elements.json | head -c 80   # data is served
```

Then ask the owner to open the site in a browser and check that:
- the landing-page gallery renders,
- in the builder, **Download PNG** works,
- **Copy image** works. It needs HTTPS, so it should work on the public hostname.

## 6. Updating later

```sh
cd periodic_table_builder
git pull
docker compose up -d --build web        # path 4A
docker compose up -d --build            # path 4B
```

The containers use `restart: unless-stopped`, so they come back after a reboot as long as
Docker starts on boot (`sudo systemctl enable docker`).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Public URL shows Cloudflare error 502 or 1033 | The tunnel can't reach the service URL. Recheck the `localhost` vs container name vs LAN IP choice in 4A |
| Public URL shows error 1016 or doesn't resolve | The DNS route is missing. Add the public hostname / `cloudflared tunnel route dns` |
| Page loads but says it "could not load element data" | `data/elements.json` wasn't copied into the image. Rebuild with `--build` |
| `bind: address already in use` | Port 8080 is taken. Change the host port in `docker-compose.yml` |
| "Copy image" fails | The page isn't on HTTPS or localhost, or the browser doesn't support clipboard images. Download PNG still works |
