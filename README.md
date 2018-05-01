# sola

[![](https://david-dm.org/soruly/sola/status.svg)](https://david-dm.org/soruly/sola)
[![License](https://img.shields.io/github/license/soruly/sola.svg)](https://github.com/soruly/sola/blob/master/LICENSE)
[![Discord](https://img.shields.io/discord/437578425767559188.svg)](https://discord.gg/K9jn6Kj)
[![Donate](https://img.shields.io/badge/donate-patreon-orange.svg)](https://www.patreon.com/soruly)

Scene search On Liresolr for Animation.

Making use of a modified version of [LIRE Solr](https://github.com/dermotte/liresolr) to look up video scenes with an image. (accurate to 0.01s)

This is exactly the video indexing scripts used by Anime Scene Search service - [whatanime.ga](https://whatanime.ga).  
sola is not limited to use with anime. As long as the video is in mp4 format, this can be used for any video.

## Demo

Let's say I have an image:
![](https://images.plurk.com/wOMmC7dfE6kJJCclGfqw.jpg)

And I've a number of mp4 files in folder 98693/*.mp4 indexed and loaded into solr

Now I lookup when and where this scene appears:
```
[soruly@socky sola]$ node src/search.js /tmp/1.jpg
Searching http://192.168.1.100:8983/solr/lire_* for /mnt/nfs/store/1.jpg
[
  {
    "d": 3.414213562373095,
    "id": "98693/[Neo.sub][Slow Start][06][GB][1080P].mp4/74.92"
  },
  {
    "d": 3.414213562373095,
    "id": "98693/[Neo.sub][Slow Start][11][GB][1080P].mp4/119.83"
  },
  {
    "d": 3.414213562373095,
    "id": "98693/[Neo.sub][Slow Start][12][GB][1080P].mp4/131.92"
  },
  {
    "d": 2.8284271247461903,
    "id": "98693/[Neo.sub][Slow Start][12][GB][1080P].mp4/131.83"
  },
  {
    "d": 2.8284271247461903,
    "id": "98693/[Neo.sub][Slow Start][07][GB][1080P].mp4/36.83"
  }
]
[soruly@socky sola]$ 
```

This scene can be found in `98693/[Neo.sub][Slow Start][07][GB][1080P].mp4` at time `00:36.83` with 2.828% difference.

## Features
- Helper command to setup liresolr and multiple solr cores
- Distributed workers for indexing video
- Load pre-hashed files into multiple cores (balanced)
- Frame deduplication
- Watch folder and index new videos automatically
- Post updates to telegram channel
- Search multiple cores at once
- Scalable to search 700 million frames in <3 seconds

## Prerequisites

- Linux (only tested on Fedora 27)
- Node.js 8+
- Java 8
- ffmpeg
- solr 7.x
- RabbitMQ 3.6+
- MariaDB 10.2+

To check the versions:
```
node -v
# v8.11.0
java -version
# openjdk version "1.8.0_171"
# OpenJDK Runtime Environment (build 1.8.0_171-b10)
# OpenJDK 64-Bit Server VM (build 25.171-b10, mixed mode)
/opt/solr/bin/solr -version
# 7.2.1
sudo rabbitmqctl status | grep '"RabbitMQ"'
# {rabbit,"RabbitMQ","3.6.15"},
ffmpeg -version
# ffmpeg version 3.3.6 Copyright (c) 2000-2017 the FFmpeg developers
# built with gcc 7 (GCC)
mysql -V
# mysql  Ver 15.1 Distrib 10.2.14-MariaDB, for Linux (x86_64) using readline 5.1
```

## Installing Prerequisites

Fedora 27 is used as example
```
# install rpmfusion (which provides ffmpeg)
sudo dnf install https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm
# install Node.js, Java, RabbitMQ, MariaDB and ffmpeg
sudo dnf install nodejs java-1.8.0-openjdk-devel rabbitmq-server mariadb-server ffmpeg

sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server

sudo systemctl enable mariadb
sudo systemctl start mariadb

# install solr
wget http://archive.apache.org/dist/lucene/solr/7.2.1/solr-7.2.1.zip
unzip solr-7.2.1.zip
./solr-7.2.1/bin/install_solr_service.sh solr-7.2.1.zip -f -n
sudo systemctl enable solr
sudo systemctl start solr
```

## Getting Started
### 1. Clone this repo and install
```
git clone git@github.com:soruly/sola.git
cd sola
npm install --only=production
```

### 2. Install the liresolr plugin

### 2a. Using pre-built jar files (for linux only)  
- Download jar files from [https://github.com/soruly/liresolr/releases](https://github.com/soruly/liresolr/releases)
- Put them in `/opt/solr/server/solr-webapp/webapp/WEB-INF/lib/`  
- Note: remember to set permission (chown) appropriately
- Restart solr

### 2b. Build from source (if the jar files does not work)
```
git clone git@github.com:soruly/liresolr.git
cd liresolr
./gredlew distForSolr
sudo cp dist/lire*.jar /opt/solr/server/solr-webapp/webapp/WEB-INF/lib/
sudo systemctl restart solr
```

### 2c. Using docker:
The docker image for the modified liresolr: [https://hub.docker.com/r/soruly/liresolr/](https://hub.docker.com/r/soruly/liresolr/)
```
docker run -d -p 8983:8983 --name liresolr --rm -v /var/solr:/var/solr soruly/liresolr
```

### 3. Configure your settings in `config.json`

Create MariaDB user and create a new database.  
All the options in config.json is required.  
Leave `telegram_channel_url` null to disable pushing notifications to telegram.

Example config
```
{
  "mariadb_host": "192.168.1.100", # make sure the DB is accessible from all workers
  "mariadb_user": "whatanime",
  "mariadb_pass": "whatanime",
  "mariadb_db": "whatanime", # you need to create this db yourself
  "solr_endpoint": "http://192.168.1.100:8983/solr/", # make sure this endpoint is accessible from all workers
  "solr_core": "lire", # cores name prefix, cores will be created as lire_0, lire_1, lire_2
  "anime_path": "/mnt/nfs/data/anilist/", # make sure the path is accessible from all workers
  "hash_path": "/mnt/nfs/data/anilist_hash/", # make sure the path is accessible from all workers
  "amqp_server": "amqp://sola:sola@192.168.1.100", # amqp://username:password@host
  "amqp_hash_queue": "hash_video", # queue name
  "amqp_load_queue": "load_hash", # created automatically, usually no need to change this
  "telegram_channel_url": null # https://api.telegram.org/botxxxxx:xxxxxxxxxxxxx/sendMessage
}
```

### 4. Create solr core
```
sudo npm run create-core
```
Warning: If the cores with the same name are already created, it will be deleted

### 5. Start a video hashing worker
```
npm run hash
```

### 6. Start a load hash worker
```
npm run load
```

### 7. Check for files and submit new jobs to workers
```
npm run check-new
```
Now check if the workers receive jobs and see if they are working appropriately.

In case you need to index a lot of images at the same time, you need to raise your ulimit to previent "too many opened files error". https://www.cyberciti.biz/faq/linux-increase-the-maximum-number-of-open-files/

If some tasks took too long to process (e.g. hashing long video with slow processor), you need to increase heartbeat interval on RabbitMQ.
Found the line `{heartbeat, 60},` in `/etc/rabbitmq/rabbitmq.config` and add `{heartbeat, 1200}` below it.

### 8. Submit an image search
```
node src/search.js /tmp/1.jpg
```

There is no JS API (yet). If you need to intergrate this into your app, start reading `src/search.js` (~30 lines of code) and see how you send the same HTTP requests to solr directly.

### Watch for new files
```
npm run watch
```
To increase OS limit on numbers of files to watch, use  
`echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p`

### Delete solr core
```
npm run delete-core
```

## Caveats

If you wish to run tasks in background, you can use [pm2](https://github.com/Unitech/pm2) or simply run in a detachable shell like [GNU screen](https://www.gnu.org/software/screen/).

To cleanup from any dirty worker state, just stop all workers and `rm -rf /tmp/sola`
