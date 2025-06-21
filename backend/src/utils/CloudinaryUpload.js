const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Single file upload
const uploadToCloudinary = async (file, folder = "uploads") => {
  return new Promise((resolve, reject) => {
    // Create a stream for uploading
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          console.error("Error uploading to Cloudinary:", error);
          reject(error);
        } else {
          // Return file information with Cloudinary URL
          resolve({
            type: file.mimetype,
            name: file.originalname,
            url: result.secure_url,
            publicId: result.public_id,
            size: file.size,
          });
        }
      }
    );

    // Pass the file buffer to the upload stream
    const bufferStream = require("stream").Readable.from(file.buffer);
    bufferStream.pipe(uploadStream);
  });
};

// Multiple files upload (array of files)
const uploadMultipleToCloudinary = async (files, folder = "uploads") => {
  if (!files || files.length === 0) {
    return [];
  }

  try {
    const uploadPromises = files.map((file) =>
      uploadToCloudinary(file, folder)
    );
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error("Error uploading multiple files to Cloudinary:", error);
    throw error;
  }
};

// Upload files from req.files object (from multer fields)
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

      // Limit number of files if specified
      const filesToUpload = files.slice(0, maxFiles);

      if (filesToUpload.length === 1) {
        // Single file - return object directly
        results[fieldName] = await uploadToCloudinary(
          filesToUpload[0],
          fieldFolder
        );
      } else {
        // Multiple files - return array
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

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw error;
  }
};

// Delete multiple files from Cloudinary
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

// Utility function to extract public IDs from upload results
const extractPublicIds = (uploadResults) => {
  if (Array.isArray(uploadResults)) {
    return uploadResults.map((result) => result.publicId);
  } else if (uploadResults && uploadResults.publicId) {
    return [uploadResults.publicId];
  }
  return [];
};

module.exports = {
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  uploadFieldsToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  extractPublicIds,
};
