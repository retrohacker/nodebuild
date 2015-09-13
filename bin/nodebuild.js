#!/usr/bin/env node

var async = require('async')
var request = require('request')
var yargs = require('yargs')
var spawn = require('child_process').spawn
var fs = require('fs')
var path = require('path')
var tmp = require('tmp')
var cpr = require('cpr')

var argv = yargs.usage("$0 command")
                .command("build","build against versions of node",build)
                .command("list","list all available versions",printTags)
                .demand(1,"must provide a valid command")
                .help("h")
                .alias("h","help")
                .argv

function handleError(e) {
  console.error(e.stack)
  process.exit(1)
}

function getTags(cb) {
  console.log("Fetching available versions")
  request.get('https://registry.hub.docker.com/v1/repositories/nodesource/node/tags',function(e,resp) {
    if(e) return handleError(e)
    if(resp.statusCode!==200) return handleError(new Error("Non-200 response from docker hub: "+resp.statusCode+"\nMessage Body: \n"+resp.body))
    var tags = parseTags(resp.body)
    cb(tags)
  })
}

function parseTags(str) {
  var result = []
  // Filter out any aliased tags (i.e. latest, and 0.10)
  var regex = /^(iojs-)?[0-9]+\.[0-9]+\.[0-9]+$/
  try {
    var tags = JSON.parse(str)
  } catch(e) {
    return handleError(e)
  }
  tags.forEach(function(v) {
    if(v.name.search(regex)>=0) result.push(v.name)
  })
  return result
}

function printTags() {
  getTags(function(tags) {
    console.log()
    tags.forEach(function(v) {
      console.log("   "+v)
    })
  })
}

function build() {
  getTags(function(tags) {
    console.log("Downloading latest Images... (this may take a while, go grab coffee)")
    //downloadImages(tags,function() {
      getDockerfile(function(file) {
        console.log("Creating temporary working directories")
        createTmpDirs(tags,file,function(tags) {
          kickoffBuilds(tags,file,function(failed) {
            generateLogs(tags,function() {
              if(failed.length>0) {
                console.log("The following versions did no build properly:")
                failed.forEach(function(v) {
                  console.log("\t"+v)
                })
                console.log("Check the generated output.md for more information")
              } else {
                console.log("All build passed! Congratz!")
              }
            })
          })
        })
      })
    //})
  })
}

function generateLogs(tags,cb) {
  var count = tags.length
  console.log("Generating Output")
  fs.writeFile(path.join(process.cwd(),"output.md"),"nodebuild output\n================\n\n",'utf8',function(e) {
    if(e) {
      console.error("Encountered error while generating output file... This is bad, you must rerun the tool.")
      return handleErrors(e)
    }
    async.eachSeries(Object.keys(tags),function(v,cb) {
      fs.readFile(path.join(tags[v],"output"),'utf8',function(e,data) {
        if(e) {
          console.error("Error while generating output for",v)
          console.error(e)
          console.error(e.stack)
        }
        data = "## "+v+"\n\n```\n"+data+"\n```"+"\n\n"
        fs.appendFile(path.join(process.cwd(),"output.md"),data,'utf8',function(e) {
          if(e) {
            console.error("Error while generating output for",v)
            console.error(e)
            console.error(e.stack)
          }
          cb()
        })
      })
    },function(e) {
      if(e) {
        console.error("Error while generating output for",v)
        console.error(e)
        console.error(e.stack)
      }
      cb()
    })
  })
}

function createTmpDirs(tags,file,cb) {
  var count = tags.length
  var result = []
  tags.forEach(function(v) {
    // We need to create a temporary directory to copy the project into and create a custom Dockerfile
    tmp.dir({unsafeCleanup:true},function (e,tmpdir) {
      result[v] = tmpdir
      if(e) return handleErrors(e)
      cpr(process.cwd(),tmpdir,function(e) {
        if(e) return handleErrors(e)
        fs.writeFile(path.join(tmpdir,"Dockerfile"),"FROM nodesource/node:"+v+"\n"+file,function(e) {
          if(e) return handleErrors(e)
          count=count-1
          if(count===0) return cb(result)
        })
      })
    })
  })
}

function kickoffBuilds(tags,file,cb) {
  var count = Object.keys(tags).length
  var errors = []
  console.log("Building against "+count+" versions of Node...")
  Object.keys(tags).forEach(function(v) {
    fs.open(path.join(tags[v],'output'),'w+',function(e,fd) {
      if(e) fd=null
      spawn('docker',['build','--no-cache','-t','project-'+v,'.'],{
        cwd:tags[v],
        stdio:[null,fd,fd]
      })
      .on('close',function(code) {
        console.log("Finished building",v)
        count=count-1
        if(code!==0) {
          errors.push(v)
        }
        if(count===0) return cb(errors)
      })
    })
  })
}

function downloadImages(tags,cb) {
  var count = tags.length
  tags.forEach(function(v) {
    downloadImage(v,function(e) {
      if(e) return console.error("Failed to download",v)
      console.log("Downloaded ",v)
      count=count-1
      if(count === 0) return cb()
    })
  })
}

function downloadImage(image,cb) {
  spawn('docker',['pull','nodesource/node:'+image])
  .on("close",function(code) {
    if(code!==0) return cb(code)
    else return cb()
  })
}

function getDockerfile(cb) {
  fs.readFile(path.join(process.cwd(),"Dockerfile"),'utf8',function(e,data) {
    if(e) return handleError(new Error("No Dockerfile found. Please create a Dockerfile that builds your project."))
    //Remove the "FROM" line so we can replace it with our own
    data = data.split('\n').filter(function(v){return v.search(/^FROM.*$/)===-1}).join('\n')
    cb(data)
  })
}
