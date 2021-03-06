// server.js
const express        = require('express');
var cors             = require('cors')
const bodyParser     = require('body-parser');
const app            = express();
const request        = require('request');
const qs             = require('qs');
var querystring      = require('querystring');
const rp             = require('request-promise');


var configFile = require('./config.js');

//restrict CORS to hosts listed in config.js file
var corsOptions ={
  "origin": configFile.hosts,
  "preflightContinue": true,
  "credentials":true
}

app.use(cors(corsOptions))

const tenant_url =configFile.tenant_url;
const port =configFile.port;
const chords_url =configFile.chords_url;
const chords_api_token = configFile.chords_api_token;
const chords_email = configFile.chords_email;

// listen for new web clients:
app.listen(port, () => {
 console.log("Server running on port: "+port);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// GET method route
app.get('/', function (req, res) {
  res.send('GET request to the homepage')
})



// SITE GET
// fetch all Agave chords sites
//example: curl -sk -H "Authorization: Bearer 0e7fb437593e01973ac443cd646a8ed" -X GET 'http://localhost:4000/sites'
app.get('/sites', cors(corsOptions),function (req, res) {
  console.log("Sites requested")

  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  var query ={'name':'Site', 'value.type':"chords"}
  console.log(query)
  var agave_header = {
                'accept': 'application/json',
                'content-type': 'application/json; charset=utf-8',
                'Authorization': 'Bearer ' + token
            };
  var get_sites_options = {
      url: "https://"+tenant_url+"/meta/v2/data?q="+JSON.stringify(query),
      headers: agave_header,
      json: true
    }
  //fetch agave instrument metadata obj with only chords_id field
  rp.get(get_sites_options)
    .then( function (response) {
      console.log(response)
      res.send(response)
    })
    .catch(function (err) {
        console.log(err)
    })//catch for instrument metadata fetch
})

//Site POST stream - create a metadata record that defines the timeseries site
// name: site name
// lat: latitude in wgs84
// lon: longitude in wgs84
// geojson: geojson object for spatial searching. example: {"type": "Point","coordinates": [2.0,4.0]}
//   example geojson encoded: %7B%22type%22%3A%20%22Point%22%2C%22coordinates%22%3A%20%5B2.0%2C4.0%5D%7D
// elevation: elevation
// site_type_id: 42 is the default
// example curl call:  curl -sk -H "Authorization: Bearer 0e7fb437593e01973ac443cd646a8ed" -X POST 'http://localhost:4000/sites?name=awesome&lat=2.0&lon=4.0&elevation=0.9&geojson=%7B%22type%22%3A%20%22Point%22%2C%22coordinates%22%3A%20%5B2.0%2C4.0%5D%7D'
app.post('/sites', cors(corsOptions),function (req, res) {
  console.log("Sites posted")
  //ignore SSL validation in case tenant uses self-signed cert
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'',        // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token

  var chords_uri = "http://"+chords_url+"/sites.json";
  //create chords site parameters and form data
  if (req.query.name && req.query.lat && req.query.lon){
    site_data ={email:chords_email,api_key: chords_api_token,site: {name: req.query.name,lat: req.query.lat, lon: req.query.lat,elevation: req.query.elevation,site_type_id: 42,commit: "Add a New Site"}}
    var postData = qs.stringify(site_data)
    var chord_options = {
      uri: chords_uri,
      method: 'POST',
      body: postData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    var agave_header = {
                  'accept': 'application/json',
                  'content-type': 'application/json; charset=utf-8',
                  'Authorization': 'Bearer ' + token
              };

    var agave_url = "https://"+tenant_url+"/meta/v2/data/"
    // request object
    request.post(chord_options,  function (err, resp, data) {
      if (err) {
        console.log('Error:', err);
        res.send(err)
      } else if (resp.statusCode !== 200) {
        console.log('Status:', resp.statusCode);
        console.log(data)
        results = JSON.parse(data)
        //create Agave metadata JSON string
        meta = '{"name":"Site","value":{"name":"'+results['name']+'","type":"chords","latitude":'+results['lat']+',"longitude":'+results['lon']+', "chords_id":'+results['id']+',"loc": '+req.query.geojson+'}}'
        console.log(meta)
        var options = {
            url: agave_url,
            headers: agave_header,
            encoding: null, //encode with binary
            body:meta
          }
        request.post(options, (err, response, result) => {
            if (err) {
              console.log('Error:', err);
              //return err
            } else if (response.statusCode !== 200) {
              console.log('Status:', resp.statusCode);
              console.log(result)
              res.send(result)
              //return data
            } else {
              console.log(result);
              res.send(result);
            }
        });
      } else {
        console.log(data);
        res.send(data )
      }
    });
  }
  else{
    res.send("ERROR: name,lat and lon are required parameters.  Please check your API call and try again.")
  }
})

//INSTRUMENTS GET
//Fetch instruments from Agave Metadata based on site uuid
// site_uuid: Agave metadata uuid for site, if not provided will fetch all instruments user has access too
// example: curl -sk -H "Authorization: Bearer 0e7fb437593e01973ac443cd646a8ed" -X GET 'http://localhost:4000/instruments?site_uuid=6162433366031330840-242ac1111-0001-012'
app.get('/instruments', cors(corsOptions),function (req, res) {
  console.log("Instruments requested")
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  var query ={'name':'Instrument','value.type':'chords'}
  if(req.query.site_uuid != undefined){
    query['associationIds'] = req.query.site_uuid
  }
  console.log(query)
  var agave_header = {
                'accept': 'application/json',
                'content-type': 'application/json; charset=utf-8',
                'Authorization': 'Bearer ' + token
            };
  var get_instruments_options = {
      url: "https://"+tenant_url+"/meta/v2/data?q="+JSON.stringify(query),
      headers: agave_header,
      json: true
    }
  //fetch agave instrument metadata obj with only chords_id field
  rp.get(get_instruments_options)
    .then( function (response) {
      console.log(response)
      res.send(response)
    })
    .catch(function (err) {
        console.log(err)
    })//catch for instrument metadata fetch
})

//INSTRUMENT POST
// site_uuid: Agave UUID of site
// name: my_sensor1
// sensor_id: my_sensor1
// topic_category_id: 19
// description: some
// display_points: 120
// plot_offset_value: 1
// plot_offset_units: weeks
// sample_rate_seconds: 60
// commit: Create Instrument
//example curl -sk -H "Authorization: Bearer f11c301e355d1ce44a228e31f8c35d2" -X POST 'http://localhost:4000/instruments?site_uuid=569912752204485096-242ac1112-0001-012&name=Excellent'
app.post('/instruments', cors(corsOptions),function (req, res) {
  console.log("Instruments posted")
  //ignore SSL validation in case tenant uses self-signed cert
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  if (req.query.site_uuid){

    var agave_header = {
                  'accept': 'application/json',
                  'content-type': 'application/json; charset=utf-8',
                  'Authorization': 'Bearer ' + token
              };

    var get_profile_options = {
      url: "https://"+tenant_url+"/profiles/me",
      headers: agave_header,
      json: true
    }
    //fetch agave profile
    rp.get(get_profile_options)
      .then(function (response) {
        console.log(response)
        var get_metadata_pem_options = {
            url: "https://"+tenant_url+"/meta/v2/data/"+req.query.site_uuid+"/pems/"+response['result']['username'],
            headers: agave_header,
            json: true
          }
        //fetch agave site metadata permission for profile username
        rp.get(get_metadata_pem_options)
          .then(function (response1) {
              console.log(response1)
              if(response1['result']['permission']['write'] == true){
                //We can write so lets fetch the site_id
                var get_metadata_options = {
                    url: "https://"+tenant_url+"/meta/v2/data/"+req.query.site_uuid+"?filter=value.chords_id",
                    headers: agave_header,
                    json: true
                  }
                //fetch agave site metadata obj with only chords_id field
                rp.get(get_metadata_options)
                  .then( function (response2) {
                    instrument_data ={email:chords_email,api_key: chords_api_token,instrument: {site_id: response2['result']['value']['chords_id'],name: req.query.name,sensor_id: req.query.name, topic_category_id: 19, description: req.query.description, display_points: 120,plot_offset_value: 1, plot_offset_units: "weeks", sample_rate_seconds: 60,commit: "Create Instrument"}}
                    var postData = qs.stringify(instrument_data)
                    var post_instrument_options ={
                      uri: "http://"+chords_url+"/instruments.json",
                      method: 'POST',
                      body: postData,
                      headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': postData.length
                      },
                      json:true
                    }
                    //post chords instument
                    rp.post(post_instrument_options)
                      .then(function (response3) {
                        console.log(response3)
                        meta = {name:"Instrument",associationIds:[req.query.site_uuid],value:{name:response3['name'],type:"chords",chords_id:response3['id'],chords_site_id:response3['site_id']}}
                        var post_instrument_metadata_options = {
                            url: "https://"+tenant_url+"/meta/v2/data/",
                            headers: agave_header,
                            encoding: null, //encode with binary
                            body:meta,
                            json:true
                          }
                        //post Agave instrument metadata
                        rp.post(post_instrument_metadata_options)
                          .then(function (response4) {
                            console.log(response4)
                            res.send(response4['result'])
                          })//then for Agave instrument metadata creation
                          .catch(function (err4) {
                              console.log(err4)
                              res.send(err4)
                          });//catch for Agave instrument metadata creation
                      })//then for chords instrument post
                      .catch(function (err3) {
                          console.log(err3)
                          res.send(err3)
                      });//catch for chords instrument post
                  })//then for site metadate fetch
                  .catch(function (err2) {
                      console.log(err2)
                      res.send(err2)
                  });//catch for site metadata fetch
              }//close if for metadata permission check
              else{
                res.send('{error: "User lacks WRITE permission for site: '+req.query.site_uuid +'"}')
              }
          })//then for site metadata permissions fetch
          .catch(function (err1) {
              console.log(err1)
              res.send(err1)
          });//catch for site metadata permissions fetch
      })//then for profiles fetch
      .catch(function (err) {
          console.log(err)
          res.send(err)
      });//catch for profile fetch
  }//close if
})


//VARIABLES GET
//Fetch variables from Agave Metadata based on instrument uuid
// instrument_uuid: Agave metadata uuid for instrument, if not provided will fetch all variables user has access too
// example: curl -sk -H "Authorization: Bearer f11c301e355d1ce44a228e31f8c35d2" -X GET 'http://localhost:4000/variables?instrument_uuid=7363236815187734040-242ac1111-0001-012'
app.get('/variables', cors(corsOptions),function (req, res) {
  console.log("Variables requested")
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  var query ={'name':'Variable', 'value.type':'chords'}
  if(req.query.instruments_uuid != undefined){
    query['associationIds'] = req.query.instrument_uuid
  }
  console.log(query)
  var agave_header = {
                'accept': 'application/json',
                'content-type': 'application/json; charset=utf-8',
                'Authorization': 'Bearer ' + token
            };
  var get_instruments_options = {
      url: "https://"+tenant_url+"/meta/v2/data?q="+JSON.stringify(query),
      headers: agave_header,
      json: true
    }
  //fetch agave variables metadata objects
  rp.get(get_instruments_options)
    .then( function (response) {
      console.log(response)
      res.send(response)
    })
    .catch(function (err) {
        console.log(err)
    })//catch for variable metadata fetch
})

//VARIABLES POST
//name: name
//shortname: shortname
//units: measurement units example Meters per second
//units_abbrv: units abbreviation example: m/s
//instrument_uuid: the Agave instrument metadata UUID
//example: curl -sk -H "Authorization: Bearer f11c301e355d1ce44a228e31f8c35d2" -X POST 'http://localhost:4000/variables?instrument_uuid=7363236815187734040-242ac1111-0001-012&name=Awesome&shortname=aw&units=blargs&units_abbrv=blgs'
app.post('/variables', cors(corsOptions),function (req, res) {
  console.log("Variable posted")
  //ignore SSL validation in case tenant uses self-signed cert
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  var agave_header = {
                'accept': 'application/json',
                'content-type': 'application/json; charset=utf-8',
                'Authorization': 'Bearer ' + token
            };

  var get_profile_options = {
    url: "https://"+tenant_url+"/profiles/me",
    headers: agave_header,
    json: true
  }
  //fetch agave profile
  rp.get(get_profile_options)
    .then(function (response) {
      console.log(response)
      var get_metadata_pem_options = {
          url: "https://"+tenant_url+"/meta/v2/data/"+req.query.instrument_uuid+"/pems/"+response['result']['username'],
          headers: agave_header,
          json: true
        }
        //fetch agave instrument metadata permission for profile username
        rp.get(get_metadata_pem_options)
          .then(function (response1) {
              console.log(response1)
              if(response1['result']['permission']['write'] == true){
                //We can write so lets fetch the site_id
                var get_metadata_options = {
                    url: "https://"+tenant_url+"/meta/v2/data/"+req.query.instrument_uuid+"?filter=value.chords_id",
                    headers: agave_header,
                    json: true
                  }
                //fetch agave instrument metadata obj with only chords_id field
                rp.get(get_metadata_options)
                  .then( function (response2) {
                    variable_data ={email:chords_email,api_key: chords_api_token,var: {instrument_id: response2['result']['value']['chords_id'],name: req.query.name,shortname: req.query.shortname,commit: "Create Variable"}}
                    var postData = qs.stringify(variable_data)
                    var post_instrument_options ={
                      uri: "http://"+chords_url+"/vars.json",
                      method: 'POST',
                      body: postData,
                      headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': postData.length
                      },
                      json:true
                    }
                    //post chords variable
                    rp.post(post_instrument_options)
                      .then(function(response3){
                        //create Agave variable
                        console.log(response3)
                        meta = {name:"Variable",associationIds:[req.query.instrument_uuid],value:{name:response3['name'],shortname:response3['shortname'],type:"chords",units:req.query.units, units_abbrv: req.query.units_abbrv, chords_id:response3['id']}}
                        var post_instrument_metadata_options = {
                            url: "https://"+tenant_url+"/meta/v2/data/",
                            headers: agave_header,
                            encoding: null, //encode with binary
                            body:meta,
                            json:true
                          }
                        //post Agave instrument metadata
                        rp.post(post_instrument_metadata_options)
                          .then(function (response4) {
                            console.log(response4)
                            res.send(response4['result'])
                          })//then for Agave variable metadata creation
                          .catch(function (err4) {
                              console.log(err4)
                              res.send(err4)
                          });//catch for Agave variable metadata creation
                      })
                      .catch(function (err3) {
                          console.log(err3)
                          res.send(err3)
                      });//catch chords variable post
                })
                .catch(function (err2) {
                    console.log(err2)
                    res.send(err2)
                });//catch fetch agave instrument metadata
          }
          else {
            res.send('{error: "User lacks WRITE permission for instrument: '+req.query.instrument_uuid +'"}')
          }
        })
        .catch(function (err1) {
            console.log(err1)
            res.send(err1)
        });//catch fetch agave insrument permissions
      })
    .catch(function (err) {
        console.log(err)
        res.send(err)
    });//catch for profile fetch
})

//MEASUREMENT GET
//Fetch measurements by instrument
//instrument_uuid
//format:  json or csv
//example: curl -sk -H "Authorization: Bearer 0e7fb437593e01973ac443cd646a8ed" -X GET 'http://localhost:4000/measurements?instrument_uuid=2520111234992181736-242ac1111-0001-012&format=csv'
app.get('/measurements', cors(corsOptions),function (req, res) {
  console.log("Instruments requested")
  //ignore SSL validation in case tenant uses self-signed cert
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
//  var query = "{'$and':[{'name':'Instrument'},{'associationIds':["+req.query.instrument_uuid+"}"
  var agave_header = {
                'accept': 'application/json',
                'content-type': 'application/json; charset=utf-8',
                'Authorization': 'Bearer ' + token
            };
  var get_instruments_options = {
      url: "https://"+tenant_url+"/meta/v2/data/"+req.query.instrument_uuid,
      headers: agave_header,
      json: true
    }
  //fetch agave instrument metadata obj with only chords_id field
  rp.get(get_instruments_options)
    .then( function (response) {
      console.log(response)
      if (response['result']['uuid'] != undefined){
        var get_measurments_options={
          url: "http://"+chords_url+"/instruments/"+response['result']['value']['chords_id']+"."+ req.query.format+"?email="+chords_email+"&api_key="+chords_api_token,
          headers: {'Content-Type': 'application/json'}
        }
        rp.get(get_measurments_options)
          .then( function (response2) {
            console.log(response2)
            res.send(response2)
          })
          .catch(function (err2) {
              console.log(err2)
              res.send(err2)
          });//catch for profile fetch
      }
      else{
        res.send('{error: "No Instrument matching uuid: '+req.query.instrument_uuid +' was found."}')
      }
    })
    .catch(function (err) {
        console.log(err)
        res.send(err)
    });//catch for agave instrument metadata fetch
})

// MEASUREMENT POST
// instrument_uuid: Agave uuid of instrument metadata object
// at: timestamp for measurement (if not provided the system will use system time submitted)
// vars[]: a hash/dictionary of variables using shortnames- NOTE these have to be defined for the chords instrument or they are ignored
//curl -sk -H "Authorization: Bearer AGAVE_TOKEN" -X POST 'http://localhost:4000/measurements?instrument_uuid=2520111234992181736-242ac1111-0001-012&vars%5Btemp%5D=25.0&vars%5Bdiss_ox%5D=1.5&vars%5Bhumidity%5D=0.5'
app.post('/measurements', cors(corsOptions),function (req, res) {
  console.log("Measurement posted")
  console.log(req.query)
  //ignore SSL validation in case tenant uses self-signed cert
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  if (req.query.instrument_uuid){
    var agave_header = {
                  'accept': 'application/json',
                  'content-type': 'application/json; charset=utf-8',
                  'Authorization': 'Bearer ' + token
              };
    var get_profile_options = {
      url: "https://"+tenant_url+"/profiles/me",
      headers: agave_header,
      json: true
    }
    //fetch agave profile
    rp.get(get_profile_options)
      .then(function (response) {
        console.log(response)
        var get_metadata_pem_options = {
            url: "https://"+tenant_url+"/meta/v2/data/"+req.query.instrument_uuid+"/pems/"+response['result']['username'],
            headers: agave_header,
            json: true
          }
          //fetch agave instrument metadata permission for profile username
        rp.get(get_metadata_pem_options)
          .then(function (response1) {
            console.log(response1)
            if(response1['result']['permission']['write'] == true){
              //We can write to lets fetch the instrument_id
              var get_metadata_options = {
                  url: "https://"+tenant_url+"/meta/v2/data/"+req.query.instrument_uuid+"?filter=value.chords_id",
                  headers: agave_header,
                  json: true
                }
              //fetch agave instrument metadata obj with only chords_id field
              rp.get(get_metadata_options)
                .then( function (response2) {
                  console.log(response2)
                  measurement_data =Object.assign({}, {email:chords_email,api_key: chords_api_token,instrument_id: response2['result']['value']['chords_id'], at: req.query.at || new Date().toISOString()},req.query.vars)
                  console.log(measurement_data)
                  var postData = qs.stringify(measurement_data)
                  var post_instrument_options ={
                    uri: "http://"+chords_url+"/measurements/url_create?",
                    method: 'GET',
                    body: postData,
                    headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'Content-Length': postData.length
                    },
                    json:true
                  }
                  //post chords measurement
                  rp.get(post_instrument_options)
                    .then(function(response3){
                      console.log(response3)
                      res.send(response3)
                    })
                    .catch(function (err3) {
                        console.log(err3)
                        res.send(err3)
                    });//catch for chords measurment post
                })//then for instrument metadata fetch
                .catch(function (err2) {
                    console.log(err2)
                    res.send(err2)
                });//catch for instrument metadata fetch
            }
        })//then for instument metadata permissions check
        .catch(function (err1) {
            console.log(err1)
            res.send(err1)
        });//catch for instrument metatdata permsisions fetch
      })
      .catch(function (err) {
          console.log(err)
          res.send(err)
      });//catch for profile fetch
  }//if check
  else{
    res.send('{error: "Instrument UUID parameter is required"}')
  }
})

//GET SPATIAL
//geometry: a geojson Geomtery Polygon or MultiPolygon
//sample geojson geometry to pass {"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}
//example (the sample geojson has been URI encoded): curl -sk -H "Authorization: Bearer 0e7fb437593e01973ac443cd646a8ed" -X GET 'http://localhost:4000/spatial?geometry=%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B0%2C0%5D%2C%5B10%2C0%5D%2C%5B10%2C10%5D%2C%5B0%2C10%5D%2C%5B0%2C0%5D%5D%5D%7D'
app.get('/spatial', cors(corsOptions),function (req, res) {
  console.log("Spatial query request")

  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  var header=req.headers['authorization']||'', // get the header
  token=header.split(/\s+/).pop(); //get the Agave API Token
  if (req.query.geometry){
    console.log(req.query.geometry)
    query = "{'$and':[{'name':'Site'},{'value.type':'chords'},{'value.loc': {$geoWithin: {'$geometry':"+req.query.geometry+"}}}]}";
    var agave_header = {
                  'accept': 'application/json',
                  'content-type': 'application/json; charset=utf-8',
                  'Authorization': 'Bearer ' + token
              };
    var get_spatial_options = {
      url: "https://"+tenant_url+"/meta/v2/data?q="+encodeURI(query)+"&limit=100000&offset=0",
      headers: agave_header,
      json: true
    }
    rp.get(get_spatial_options)
      .then(function (response) {
        console.log(response)
        res.send(response)
      })
      .catch(function (err) {
          console.log(err)
          res.send(err)
      });//catch for spatial fetch

  }
  else{
    res.send('{error: "GeoJSON geometry parameter is required"}')
  }
})
