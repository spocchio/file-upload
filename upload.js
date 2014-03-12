var fs = require("fs");
var http = require("http");
var url = require("url");
var multipart = require("./multipart.js");
var sys = require("util");
var events = require("events");
var posix = require("posix");
var execFile = require('child_process').execFile;
var querystring = require("querystring");

var port=8182;
var command='echo';
var folder='~';

function printHelp (exitp) {
  process.stdout.write("Usage: h-bue [options]\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --port    Port to run the HTTP server on ["+ port +"]\n");
  process.stdout.write("  --folder  Folder to share\n");
  process.stdout.write("  --execute Command to execute when a file is clicked\n");
  process.stdout.write("  --help    Print help\n");
  if (exitp) {
    process.exit(0);
  }
}

/* Parse command-line options, first two args are the process.
 */
for (var i = 2, argv = process.argv, len = argv.length; i < len; i++) {
  switch (argv[i]) {
    case '--help':
    printHelp(true);
    break;
  case '--port':
    var p = parseInt(argv[i+1]);
    if (isFinite(p)) {
      port = p;
      i += 1;
    } else {
      process.stderr.write("Invalid port number: "+ argv[i+1] +"\n");
      process.exit(1);
    }
    break
   case '--execute':
    command = argv[i+1];
    i += 1;
    break;
	case '--folder':
    folder = argv[i+1];
    i += 1;
    break;
  case '--background':
    break; //used in shell-script wrapper, ignore
  default:
    process.stderr.write("Invalid option: "+ argv[i] +"\n");
    printHelp();
    process.exit(1);
  }
}

console.log('running server on port '+port);
var server = http.createServer(function(req, res) {
    // Simple path-based request dispatcher
    switch (url.parse(req.url).pathname) {
        case '/':
            display_form(req, res);
            break;
        case '/upload':
            upload_file(req, res);
            break;
        case '/execute':
            execute_file(req, res);
            break;
        default:
            show_404(req, res);
            break;
    }
});

// Server would listen on port 8000
server.listen(port);




/*
 * Display upload form
 */
function display_form(req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
	
	execFile('find', [ folder ], function(err, stdout, stderr) {
		var file_list = stdout.split('\n');
		/* now you've got a list with full path file names */
		str_files = '<h3>File list</h3><ul>';
		console.log(file_list)
		for (var i = 0; i<file_list.length; i++){
			file_ele=i
			str_files += '<li><a href="/execute?'+ file_list[file_ele]+'">'+file_list[file_ele]+'</a></li>';
		}
		str_files += '</ul><hr/>';
		res.write(str_files+
			'<form action="/upload" method="post" enctype="multipart/form-data">'+
			'<input type="file" name="upload-file">'+
			'<input type="submit" value="Upload a file"/>'+
			'</form>'
		);
		res.end();
	});
}

/*
 * Create multipart parser to parse given request
 */
function parse_multipart(req) {
    var parser = multipart.parser();

    // Make parser use parsed request headers
    parser.headers = req.headers;

    // Add listeners to request, transfering data to parser

    req.addListener("data", function(chunk) {
        parser.write(chunk);
    });

    req.addListener("end", function() {
        parser.close();
    });

    return parser;
}

/*
 * Handle file upload
 */
function upload_file(req, res) {
    // Request body is binary
    req.setEncoding("binary");

    // Handle request as multipart
    var stream = parse_multipart(req);

    var fileName = null;
    var fileStream = null;

    // Set handler for a request part received
    stream.onPartBegin = function(part) {
        sys.debug("Started part, name = " + part.name + ", filename = " + part.filename);

        // Construct file name
        fileName = folder+'/' + stream.part.filename;

        // Construct stream used to write to file
        fileStream = fs.createWriteStream(fileName);

        // Add error handler
        fileStream.addListener("error", function(err) {
            sys.debug("Got error while writing to file '" + fileName + "': ", err);
        });

        // Add drain (all queued data written) handler to resume receiving request data
        fileStream.addListener("drain", function() {
            req.resume();
        });
    };

    // Set handler for a request part body chunk received
    stream.onData = function(chunk) {
        // Pause receiving request data (until current chunk is written)
        req.pause();

        // Write chunk to file
        // Note that it is important to write in binary mode
        // Otherwise UTF-8 characters are interpreted
        sys.debug("Writing chunk");
        fileStream.write(chunk, "binary");
    };

    // Set handler for request completed
    stream.onEnd = function() {
        // As this is after request completed, all writes should have been queued by now
        // So following callback will be executed after all the data is written out
        fileStream.addListener("drain", function() {
            // Close file stream
            fileStream.end();
            // Handle request completion, as all chunks were already written
            upload_complete(res);
        });
    };
}

function upload_complete(res) {
    sys.debug("Request complete");
	 display_form(null, res);
}



/*
 * Handles page not found error
 */
function show_404(req, res) {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.write("You r doing it rong!");
    res.end();
}

function execute_file(req, res) {
	file_name = url.parse(req.url).query
	execFile(command, [ file_name ], function(err, stdout, stderr) {
		console.log('eseguito',command,file_name,err,stdout,stderr);
	});
	display_form(req, res);

}
