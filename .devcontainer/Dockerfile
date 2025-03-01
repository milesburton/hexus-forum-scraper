FROM oven/bun:latest

RUN apt-get update && apt-get install -y \
    fish git curl wget vim sudo tree \
    build-essential python3 pkg-config libsqlite3-dev sqlite3

RUN chsh -s /usr/bin/fish bun
SHELL ["/usr/bin/fish", "-c"]
USER bun

RUN mkdir -p /home/bun/.config/fish

RUN echo 'if status is-interactive' > /home/bun/.config/fish/config.fish && \
    echo ' echo "-------------------------------------------------"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " 🚀 Welcome to the vbulletin-forum-scraper Dev Container!"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "-------------------------------------------------"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "Basic Usage:"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Run the scraper: bun run scrape"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Browse the data: bun run browse"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Reset database: bun run db:reset"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "-------------------------------------------------"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "Shortcuts:"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Type scrape to run the scraper"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Type browse to browse scraped data"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Type dbreset to reset the database"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "-------------------------------------------------"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "Development:"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Format code: bun run format"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo " - Check linting: bun run lint"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "-------------------------------------------------"' >> /home/bun/.config/fish/config.fish && \
    echo ' echo "🔍 Type help to see available commands!"' >> /home/bun/.config/fish/config.fish && \
    echo 'end' >> /home/bun/.config/fish/config.fish

RUN echo 'alias scrape="bun run scrape"' >> /home/bun/.config/fish/config.fish && \
    echo 'alias browse="bun run browse"' >> /home/bun/.config/fish/config.fish && \
    echo 'alias dbreset="bun run db:reset"' >> /home/bun/.config/fish/config.fish

WORKDIR /app
COPY ../package.json ./
COPY ../bun.lockb ./
RUN bun install
COPY . .
CMD ["fish"]
