const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


const uploadToCloudinary = async (file, folder = "uploads") => {
  return new Promise((resolve, reject) => {

    const uploadTimeout = setTimeout(() => {
      reject(new Error(`Upload timeout: File ${file.originalname} took too long to upload`));
    }, 120000);


    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",

        quality: "auto",
        fetch_format: "auto",

        timeout: 120000
      },
      (error, result) => {
        clearTimeout(uploadTimeout);
        if (error) {
          console.error("Error uploading to Cloudinary:", error);
          reject(error);
        } else {

          resolve({
            type: file.mimetype,
            name: file.originalname,
            url: result.secure_url,
            publicId: result.public_id,
            size: file.size
          });
        }
      }
    );


    const bufferStream = require("stream").Readable.from(file.buffer);
    bufferStream.pipe(uploadStream);
  });
};


const uploadMultipleToCloudinary = async (files, folder = "uploads") => {
  if (!files || files.length === 0) {
    return [];
  }

  try {

    const overallTimeout = 300000;
    const startTime = Date.now();

    const uploadPromises = files.map(async (file, index) => {

      if (Date.now() - startTime > overallTimeout) {
        throw new Error(`Overall upload timeout: Total time exceeded ${overallTimeout}ms`);
      }
      return uploadToCloudinary(file, folder);
    });

    const results = await Promise.all(uploadPromises);
    console.log(`✅ Successfully uploaded ${results.length} files to Cloudinary`);
    return results;
  } catch (error) {
    console.error("Error uploading multiple files to Cloudinary:", error);
    throw error;
  }
};


const uploadFieldsToCloudinary = async (reqFiles, folder, fieldConfig = {}) => {
  if (!reqFiles || Object.keys(reqFiles).length === 0) {
    return {};
  }

  const results = {};

  try {
    for (const [fieldName, files] of Object.entries(reqFiles)) {
      const fieldFolder =
      fieldConfig[fieldName]?.folder || `${folder}/${fieldName}`;
      const maxFiles = fieldConfig[fieldName]?.maxFiles || files.length;


      const filesToUpload = files.slice(0, maxFiles);

      if (filesToUpload.length === 1) {

        results[fieldName] = await uploadToCloudinary(
          filesToUpload[0],
          fieldFolder
        );
      } else {

        results[fieldName] = await uploadMultipleToCloudinary(
          filesToUpload,
          fieldFolder
        );
      }
    }

    return results;
  } catch (error) {
    console.error("Error uploading fields to Cloudinary:", error);
    throw error;
  }
};


const deleteFromCloudinary = async (publicId, options = {}) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, options);
    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw error;
  }
};


const deleteMultipleFromCloudinary = async (publicIds) => {
  try {
    const deletePromises = publicIds.map((publicId) =>
    deleteFromCloudinary(publicId)
    );
    const results = await Promise.all(deletePromises);
    return results;
  } catch (error) {
    console.error("Error deleting multiple files from Cloudinary:", error);
    throw error;
  }
};


const extractPublicIds = (uploadResults) => {
  if (Array.isArray(uploadResults)) {
    return uploadResults.map((result) => result.publicId);
  } else if (uploadResults && uploadResults.publicId) {
    return [uploadResults.publicId];
  }
  return [];
};

const uploadSingle = (file, options = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.
    upload_stream({ resource_type: "auto", ...options }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    }).
    end(file.buffer);
  });
};

module.exports = {
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  uploadFieldsToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  extractPublicIds,
  uploadSingle
};