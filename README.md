# sola

[![Build Status](https://travis-ci.org/soruly/sola.svg?branch=master)](https://travis-ci.org/soruly/sola)
[![](https://david-dm.org/soruly/sola/status.svg)](https://david-dm.org/soruly/sola)
[![License](https://img.shields.io/github/license/soruly/sola.svg)](https://github.com/soruly/sola/blob/master/LICENSE)
[![Discord](https://img.shields.io/discord/437578425767559188.svg)](https://discord.gg/K9jn6Kj)
[![Donate](https://img.shields.io/badge/donate-patreon-orange.svg)](https://www.patreon.com/soruly)

Scene search On Liresolr for Animation.

Making use of a modified version of [LIRE Solr](https://github.com/dermotte/liresolr) to look up video scenes with an image. (accurate to 0.01s)

This is exactly the video indexing scripts used by Anime Scene Search service - [whatanime.ga](https://github.com/soruly/whatanime.ga).  
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

## Hardware requirements

Indexing:  
With i7-3770, a 24-minute 720p video takes ~50 seconds to hash with one worker.  
It can run 2-3 workers in parallel to fully utilize CPU.

Searching:  
With i7-3770 and 8GB RAM, searching through a 10GB solr core takes ~1s

Performance varies a lot with your data size, configurations and settings.  
For details, please refer to [Optimization and Tuning](#optimization-and-tuning).

## Prerequisites

- Linux (only tested on Fedora 27)
- Node.js 8+
- Java 8
- ffmpeg
- solr 7.x
- RabbitMQ 3.6+
- MariaDB 10.2+

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

Verify the installed versions:
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
mkdir ~/solr_data
sudo chown 8983:8983 ~/solr_data
docker run -d -p 8983:8983 --name liresolr --rm -v ~/solr_data:/opt/solr_data soruly/liresolr
```

### 3. Configure settings in `.env` for each worker

Create MariaDB user and create a new database.  
Copy `.env.example` to `.env`  
Different workers may its own settings.  

Example env config
```
# Database setting
SOLA_DB_HOST=192.168.1.100                     # check if the database can connect from workers
SOLA_DB_PORT=3306                              #
SOLA_DB_USER=whatanime                         #
SOLA_DB_PWD=whatanime                          #
SOLA_DB_NAME=whatanime                         # you need to create this db yourself

# Solr setting
SOLA_SOLR_URL=http://192.168.1.100:8983/solr/  # check if this endpoint can connect from all workers
SOLA_SOLR_CORE=lire                            # cores will be created as lire_0, lire_1, lire_2

# resource path
# you may use mounted network folders like smb or nfs
SOLA_FILE_PATH=/mnt/nfs/data/anime/           # folder for storing raw mp4 files
SOLA_HASH_PATH=/mnt/nfs/data/anime_hash/      # folder for storing compressed hash xz archive

# RabbitMQ setting
SOLA_MQ_URL=amqp://sola:sola@192.168.1.100     # amqp://username:password@host
SOLA_MQ_HASH=hash_video                        # RabbitMQ queue ID, will create automatically
SOLA_MQ_LOAD=load_hash                         # RabbitMQ queue ID, will create automatically

# Notification setting (leave empty to disable)
SOLA_DISCORD_URL=                              # https://discordapp.com/api/webhooks/xxxxx/xxxxxxxxxxx
SOLA_TELEGRAM_ID=                              # @your_channel_name
SOLA_TELEGRAM_URL=                             # https://api.telegram.org/botxxxx:xxxxxxxx/sendMessage
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

## Optimization and Tuning

### Storage space

Compressed hash (*.xml.xz) files takes ~375KB per 24-minute anime.  
This assume the thumbnails are extracted at 12 fps (default).
Storage for compressed hash does not have to be fast. Magnetic disks are fine.  
(Side note: an archive of all *.xml.xz files from whatanime.ga can be downloaded [here](https://nyaa.si/view/1023979))

Each doc (hash) in solr takes ~200 bytes.  
(ref: the size of solr core on whatanime.ga is 135GB for 722 million frames)  
Storage device of solr core must be fast. Minumum: SATA SSD, Recommended: PCI-E/nvme SSD  
A 24-minute video has ~34560 frames. Extracting at 12 fps yields ~17280 frames. This is the number of frames in compressed hash (*.xml.xz). Before being loaded into solr, the load-hash worker use a running window to deduplicate frames of exact hash. Typically this deduplication ratio is 40%, so only 10368 frame hashes are actually loaded into solr. Which is ~2025KB in solr for each 24-minute video.

### Memory

Indexing is not memory consuming, each worker use no more than 1GB RAM. (<100MB idle)  
To have a reasonabily fast search speed, your system RAM should be at least 30% the size of solr core. (i.e. 32GB RAM for a 100GB solr core)  
You can set 2-16GB RAM for solr in `/etc/default/solr.in.sh`. Do not allocate too much (no more than 50% of your RAM). For the reset of your RAM, leave them be, and they will become file system cache (OS cache), which cache file contents on disks.

### Processor

By default, `sudo npm run create-core` will create 4 solr cores.  
You can specify number of solr cores by `sudo npm run create-core -- 8` for creating 8 cores  
This does not have to match the number of CPU cores / threads you have. Even for CPUs with 32 threads you may see diminishing returns having 32 solr cores.

With i7-3770, a 24-minute 720p video takes ~50 seconds to hash with one worker. 
80-90% of the time are spent on ffmpeg extracting thumnails.  
You need to run 2-3 workers in parallel to fully utilize the CPU.  
You can take a look at the code in `src/lib/hash.js` for hard-coded parameters.

### Search parameters

`candidates=1000000` 1 million is usually accurate and fast enough. Search would be slow above 5 million candidates. Setting candidates to low values (e.g. 100k) would greatly improve search performance but reduce accuracy. But as long as your most populated hash is less than this value, the search is accurate as it covers 100% records in solr.

`rows=10` chaning this has no effect on accuracy. It merely filter out returning results after search completed and sorted. 

`accuracy=0` the param is misleading here. The number here is used to choose "clusters", or "hash groups" to search. 0 is the least populated cluster that may found a match. 1 is the second least populated, and so on. If you cannot find any matches after searching first 6 clusters, you are unlikely to find any better matches beyond that. This is because of Locality-sensitive hashing.
